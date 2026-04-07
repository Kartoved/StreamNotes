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

      console.log('[sync] capturing', changeset.rows.length, 'rows, new db_version:', newVersion);

      // We need to route changes either to 'personal' (master key) or 'feed' (FEK).
      // Find feed_id for each note by full-text searching the binary PK blob.
      const rowsDb = await this.db.execO(`SELECT id, feed_id FROM notes`);
      const notesMap = new Map<string, string>();
      for (const r of rowsDb as any[]) {
        if (r.feed_id) notesMap.set(r.id, r.feed_id);
      }

      function getFeedId(pkBase64: string): string | null {
        const bin = atob(pkBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const text = new TextDecoder().decode(bytes);
        for (const [id, feedId] of notesMap.entries()) {
          if (text.includes(id)) return feedId;
        }
        return null;
      }

      const personalRows: typeof changeset.rows = [];
      const feedGroups = new Map<string, typeof changeset.rows>();

      for (const row of changeset.rows) {
        let feedId: string | null = null;
        if (row.table === 'notes') {
          feedId = getFeedId(row.pk);
          // If the cid itself is feed_id and val is string, it might be the initial creation
          if (!feedId && row.cid === 'feed_id' && typeof row.val === 'string' && row.val.startsWith('feed-')) {
            feedId = row.val;
          }
        } else if (row.table === 'feeds') {
          // The PK for feeds table is feed_id itself
          const bin = atob(row.pk);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const text = new TextDecoder().decode(bytes);
          
          const match = text.match(/feed-[\w-]+/);
          if (match) feedId = match[0];
          else if (row.cid === 'id' && typeof row.val === 'string' && row.val.startsWith('feed-')) {
            feedId = row.val;
          }
        }
        
        // Ensure we actually treat this feed as shared!
        if (feedId && this.sharedFeedIds.has(feedId)) {
          let rows = feedGroups.get(feedId);
          if (!rows) { rows = []; feedGroups.set(feedId, rows); }
          rows.push(row);
        } else {
          personalRows.push(row);
        }
      }

      const publishPromises: Promise<void>[] = [];

      // 1. Publish personal rows
      if (personalRows.length > 0) {
        const ev = encodeEvent({
          changeset: { v: changeset.v, rows: personalRows },
          channel: 'personal',
          encrypt: this.crypto.encrypt,
          secretKey: this.crypto.nostrPrivKey,
        });
        this.markSeen(ev.id);
        publishPromises.push(this.relay.publish(ev));
      }

      // 2. Publish per-feed rows
      for (const [feedId, rows] of feedGroups.entries()) {
        const ev = encodeEvent({
          changeset: { v: changeset.v, rows },
          channel: 'feed',
          feedId,
          encrypt: (pt) => this.crypto.encryptForFeed(pt, feedId),
          secretKey: this.crypto.nostrPrivKey,
        });
        this.markSeen(ev.id);
        publishPromises.push(this.relay.publish(ev));
      }

      await Promise.all(publishPromises);
      console.log('[sync] published to', (personalRows.length ? 1 : 0) + feedGroups.size, 'channels');

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

  public async resyncFeed(feedId: string): Promise<void> {
    if (!this.started || !this.sharedFeedIds.has(feedId)) return;
    try {
      const { changeset } = await captureChanges(this.db, -1); // -1 fetches everything
      if (!changeset.rows.length) return;

      const rowsDb = await this.db.execO(`SELECT id, feed_id FROM notes`);
      const notesMap = new Map<string, string>();
      for (const r of rowsDb as any[]) if (r.feed_id) notesMap.set(r.id, r.feed_id);

      function getFeedId(pkBase64: string): string | null {
        try {
          const bin = atob(pkBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const text = new TextDecoder().decode(bytes);
          for (const [id, fid] of notesMap.entries()) if (text.includes(id)) return fid;
          return null;
        } catch { return null; }
      }

      const feedRows = changeset.rows.filter(row => {
        if (row.table === 'notes') return getFeedId(row.pk) === feedId;
        if (row.table === 'feeds') {
          try {
            const bin = atob(row.pk);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const text = new TextDecoder().decode(bytes);
            return text.includes(feedId);
          } catch { return false; }
        }
        return false;
      });

      if (feedRows.length === 0) return;

      const ev = encodeEvent({
        changeset: { v: changeset.v, rows: feedRows },
        channel: 'feed',
        feedId,
        encrypt: (pt) => this.crypto.encryptForFeed(pt, feedId),
        secretKey: this.crypto.nostrPrivKey,
      });
      this.markSeen(ev.id);
      await this.relay.publish(ev);
      console.log(`[sync] resync published ${feedRows.length} rows for feed ${feedId}`);
    } catch (e) {
      console.error('[sync] failed to resync feed', e);
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
