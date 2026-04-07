// Top-level sync orchestrator.
export const SyncEvents = new EventTarget();
//
// Lifecycle:
//   const engine = new SyncEngine({ db, crypto, relayClient });
//   await engine.start();
//   ...
//   engine.stop();
//
// On start:
//   - load relay list from sync_relays
//   - configure relayClient
//   - subscribe to (a) own pubkey personal events, (b) per-feed events for any
//     shared feed we hold
//   - hook db.onUpdate to capture+publish local changes (debounced)
//
// MVP routing: ALL captured changes are published via the personal channel
// (master-key encrypted, addressed to our own pubkey). This covers cross-device
// sync — the primary use case. Per-feed publishing for shared collaboration
// requires decoding CR-SQLite's pk blob format to look up which feed a note
// belongs to; that's a follow-up. The receive path already handles per-feed
// events from collaborators that DO publish them, so collaboration is unblocked
// as soon as either side ships per-feed publishing.

import type { DB } from '@vlcn.io/crsqlite-wasm';
import type { Event } from 'nostr-tools/core';
import type { RelayState } from './types';
import { captureChanges, applyChanges, getDbVersion } from './changeset';
import { encodeEvent, decodeEvent, type KeyResolver } from './eventCodec';
import { RelayClient } from './relayClient';
import { SYNC_EVENT_KIND } from './types';

export interface SyncCryptoAdapter {
  encrypt: (plaintext: string) => string;
  decrypt: (ciphertext: string) => string;
  encryptForFeed: (plaintext: string, feedId: string) => string;
  /** Decrypt with a specific feed's FEK. May fall back to master key. */
  decryptForFeed: (ciphertext: string, feedId: string) => string;
  nostrPubKey: string;
  nostrPrivKey: Uint8Array;
}

export interface SyncEngineOptions {
  db: DB;
  crypto: SyncCryptoAdapter;
  relayClient: RelayClient;
  /** Debounce window for batching local changes (ms). Default 1500. */
  batchWindowMs?: number;
  /** Maximum number of recently-seen event ids to remember. */
  seenCacheLimit?: number;
}

const DEFAULT_BATCH_MS = 1500;
const DEFAULT_SEEN_LIMIT = 1024;

export class SyncEngine {
  private db: DB;
  private crypto: SyncCryptoAdapter;
  private relay: RelayClient;
  private batchWindowMs: number;
  private seenCacheLimit: number;

  private started = false;
  private cleanupOnUpdate: (() => void) | null = null;
  private cleanupSubs: Array<() => void> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight = false;
  private flushRequestedDuringPush = false;

  /** Highest local db_version we've already pushed. */
  private lastPushedVersion = 0;
  /** Recently-seen event ids — both ones we published and ones we received. */
  private seenEventIds = new Set<string>();
  /** feedId -> isShared (cached so routing decisions are sync). */
  private sharedFeedIds = new Set<string>();

  constructor(opts: SyncEngineOptions) {
    this.db = opts.db;
    this.crypto = opts.crypto;
    this.relay = opts.relayClient;
    this.batchWindowMs = opts.batchWindowMs ?? DEFAULT_BATCH_MS;
    this.seenCacheLimit = opts.seenCacheLimit ?? DEFAULT_SEEN_LIMIT;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.loadRelays();
    await this.loadFeeds();
    this.lastPushedVersion = await this.computeStartingVersion();
    console.log('[sync] start — relays:', this.relay.getRelays(), '| starting from db_version:', this.lastPushedVersion);

    this.subscribeAll();

    this.cleanupOnUpdate = this.db.onUpdate((_type, _dbName, tblName) => {
      if (tblName === 'sync_relays') return; // device-local
      this.scheduleFlush();
    });

    // Catch up on anything that piled up while sync was off
    this.scheduleFlush(/* immediate */ true);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.cleanupOnUpdate?.();
    this.cleanupOnUpdate = null;
    for (const c of this.cleanupSubs) c();
    this.cleanupSubs = [];
  }

  /** Re-read relay list & feeds from DB and reconnect. */
  async refreshRelays(): Promise<void> {
    await this.loadRelays();
    await this.loadFeeds();
    for (const c of this.cleanupSubs) c();
    this.cleanupSubs = [];
    this.subscribeAll();
  }

  // ─── Internals ────────────────────────────────────────────────────────

  private async loadRelays(): Promise<void> {
    const rows = (await this.db.execO(
      `SELECT url, is_active, last_db_version, last_event_at, added_at
       FROM sync_relays WHERE is_active = 1`,
    )) as RelayState[];
    this.relay.setRelays(rows.map((r) => r.url));
  }

  private async loadFeeds(): Promise<void> {
    const rows = (await this.db.execO(
      `SELECT id, is_shared FROM feeds`,
    )) as Array<{ id: string; is_shared: number }>;
    this.sharedFeedIds.clear();
    for (const r of rows) {
      if (r.is_shared === 1) this.sharedFeedIds.add(r.id);
    }
  }

  private async computeStartingVersion(): Promise<number> {
    // Use the stored cursor so existing notes get published on first sync (cursor = 0).
    // On subsequent starts the cursor reflects what was already pushed, so no re-publish.
    const rows = (await this.db.execA(
      `SELECT MIN(last_db_version) FROM sync_relays WHERE is_active = 1`,
    )) as Array<[number | bigint | null]>;
    const min = rows[0]?.[0];
    if (min === null || min === undefined) {
      // If we have no relays, we should probably start from 0 for the future when we DO have one
      return 0;
    }
    return typeof min === 'bigint' ? Number(min) : Number(min);
  }

  private subscribeAll(): void {
    // Personal channel: events authored by us
    const personalUnsub = this.relay.subscribe(
      { kinds: [SYNC_EVENT_KIND], authors: [this.crypto.nostrPubKey] },
      (event) => { void this.handleIncoming(event); },
    );
    this.cleanupSubs.push(personalUnsub);

    // Feed channel: any shared feed whose FEK we hold
    const sharedIds = Array.from(this.sharedFeedIds);
    if (sharedIds.length) {
      const feedUnsub = this.relay.subscribe(
        { kinds: [SYNC_EVENT_KIND], '#f': sharedIds },
        (event) => { void this.handleIncoming(event); },
      );
      this.cleanupSubs.push(feedUnsub);
    }
  }

  private scheduleFlush(immediate = false): void {
    if (this.flushInFlight) {
      this.flushRequestedDuringPush = true;
      return;
    }
    if (this.flushTimer) clearTimeout(this.flushTimer);
    const delay = immediate ? 0 : this.batchWindowMs;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (this.flushInFlight) return;
    this.flushInFlight = true;
    try {
      const { changeset, newVersion } = await captureChanges(this.db, this.lastPushedVersion);
      if (!changeset.rows.length) return;

      console.log('[sync] publishing', changeset.rows.length, 'rows, new db_version:', newVersion);
      const event = encodeEvent({
        changeset,
        channel: 'personal',
        encrypt: this.crypto.encrypt,
        secretKey: this.crypto.nostrPrivKey,
      });
      this.markSeen(event.id);
      await this.relay.publish(event);
      console.log('[sync] published event', event.id.slice(0, 12), 'kind:', event.kind);

      this.lastPushedVersion = newVersion;
      await this.db.exec(
        `UPDATE sync_relays SET last_db_version = ? WHERE is_active = 1`,
        [newVersion],
      );
    } catch (err) {
      console.error('[sync] flush failed', err);
    } finally {
      this.flushInFlight = false;
      if (this.flushRequestedDuringPush) {
        this.flushRequestedDuringPush = false;
        this.scheduleFlush();
      }
    }
  }

  private async handleIncoming(event: Event): Promise<void> {
    if (this.seenEventIds.has(event.id)) return;
    this.markSeen(event.id);

    const resolver: KeyResolver = (channel, feedId) => {
      if (channel === 'personal') {
        // Only accept personal events from ourselves
        if (event.pubkey !== this.crypto.nostrPubKey) return null;
        return this.crypto.decrypt;
      }
      if (channel === 'feed' && feedId) {
        return (ct: string) => this.crypto.decryptForFeed(ct, feedId);
      }
      return null;
    };

    const decoded = decodeEvent(event, resolver);
    if (!decoded) {
      console.warn('[sync] could not decode event', event.id.slice(0, 12), '— wrong key or channel?');
      return;
    }

    console.log('[sync] applying', decoded.changeset.rows.length, 'rows from event', event.id.slice(0, 12));
    try {
      await applyChanges(this.db, decoded.changeset);
      // Always update sync_relays to guarantee UI refresh, even if timestamp doesn't advance
      await this.db.exec(
        `UPDATE sync_relays SET last_event_at = MAX(last_event_at, ?) WHERE is_active = 1`,
        [event.created_at],
      );
      // Hack to guarantee onUpdate triggers if MAX didn't change the value:
      await this.db.exec(`UPDATE sync_relays SET added_at = added_at WHERE is_active = 1`);
      
      // Foolproof UI refresh by emitting standard JS event
      SyncEvents.dispatchEvent(new Event('sync'));
    } catch (err) {
      console.error('[sync] applyChanges failed', err);
    }
  }

  private markSeen(id: string): void {
    this.seenEventIds.add(id);
    if (this.seenEventIds.size > this.seenCacheLimit) {
      // Drop oldest ~10% (Set iteration order is insertion order)
      const drop = Math.ceil(this.seenCacheLimit * 0.1);
      const it = this.seenEventIds.values();
      for (let i = 0; i < drop; i++) {
        const next = it.next();
        if (next.done) break;
        this.seenEventIds.delete(next.value);
      }
    }
  }
}

/** Default public relays seeded on first launch. */
export const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
];

/** Insert default relays if the table is empty. Returns true if seeded. */
export async function seedDefaultRelays(db: DB): Promise<boolean> {
  const existing = (await db.execA(`SELECT COUNT(*) FROM sync_relays`)) as Array<[number | bigint]>;
  const count = existing[0]?.[0];
  const n = typeof count === 'bigint' ? Number(count) : Number(count ?? 0);
  if (n > 0) return false;
  const now = Date.now();
  for (const url of DEFAULT_RELAYS) {
    await db.exec(
      `INSERT OR IGNORE INTO sync_relays (url, is_active, last_db_version, last_event_at, added_at)
       VALUES (?, 1, 0, 0, ?)`,
      [url, now],
    );
  }
  return true;
}
