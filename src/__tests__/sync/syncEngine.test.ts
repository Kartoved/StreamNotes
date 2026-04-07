// Sync engine integration test using mock DB + mock relay.
//
// We don't spin up real CR-SQLite here (the changeset capture/apply path is
// covered separately). Instead we mock the DB to return a controllable set of
// changeset rows and assert that the engine encrypts, publishes, and applies
// events correctly. The mock relay short-circuits publish->subscribe so two
// engine instances can talk to each other in-process.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { Event } from 'nostr-tools/core';
import type { Filter } from 'nostr-tools/filter';
import { encrypt, decrypt } from '../../crypto/cipher';
import { SyncEngine, type SyncCryptoAdapter } from '../../sync/syncEngine';
import type { ChangeRow } from '../../sync/types';
import { SYNC_EVENT_KIND } from '../../sync/types';

// ─── Shared in-memory relay (publish → fan out to subscribers) ──────────
class FakeRelay {
  private subs: Array<{ filter: Filter; cb: (e: Event) => void }> = [];
  events: Event[] = [];

  publish(event: Event) {
    this.events.push(event);
    for (const s of this.subs) {
      if (this.matches(s.filter, event)) s.cb(event);
    }
  }

  private matches(filter: Filter, event: Event): boolean {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
    const fTagFilter = (filter as Filter & { '#f'?: string[] })['#f'];
    if (fTagFilter) {
      const fTags = event.tags.filter((t) => t[0] === 'f').map((t) => t[1]);
      if (!fTags.some((f) => fTagFilter.includes(f))) return false;
    }
    return true;
  }

  subscribe(filter: Filter, cb: (e: Event) => void): () => void {
    const entry = { filter, cb };
    this.subs.push(entry);
    return () => { this.subs = this.subs.filter((s) => s !== entry); };
  }
}

// Adapter matching RelayClient's surface area used by SyncEngine
class FakeRelayClient {
  constructor(private hub: FakeRelay) {}
  setRelays(_urls: string[]) { /* noop */ }
  getRelays() { return ['wss://fake']; }
  async publish(event: Event) { this.hub.publish(event); }
  subscribe(filter: Filter, cb: (e: Event) => void) { return this.hub.subscribe(filter, cb); }
  destroy() { /* noop */ }
}

// ─── Fake DB ─────────────────────────────────────────────────────────────
// Tracks two things:
//   1. A list of "local" change rows that captureChanges should return next
//   2. Applied rows from incoming events
interface FakeDB {
  pendingLocal: ChangeRow[];
  applied: ChangeRow[];
  localVersion: number;
  exec: ReturnType<typeof vi.fn>;
  execA: ReturnType<typeof vi.fn>;
  execO: ReturnType<typeof vi.fn>;
  onUpdate: ReturnType<typeof vi.fn>;
  triggerUpdate: () => void;
}

function makeFakeDB(): FakeDB {
  const updateCallbacks: Array<(t: number, d: string, tbl: string, r: bigint) => void> = [];

  const fake: FakeDB = {
    pendingLocal: [],
    applied: [],
    localVersion: 0,
    exec: vi.fn(),
    execA: vi.fn(),
    execO: vi.fn(),
    onUpdate: vi.fn((cb: (t: number, d: string, tbl: string, r: bigint) => void) => {
      updateCallbacks.push(cb);
      return () => { /* unsubscribe */ };
    }),
    triggerUpdate: () => {
      for (const cb of updateCallbacks) cb(18, 'main', 'notes', 1n);
    },
  };

  fake.execO.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM sync_relays')) {
      return [{ url: 'wss://fake', is_active: 1, last_db_version: 0, last_event_at: 0, added_at: 0 }];
    }
    if (sql.includes('FROM feeds')) {
      return [];
    }
    return [];
  });

  fake.execA.mockImplementation(async (sql: string, _params?: unknown[]) => {
    // Order matters — check the most specific patterns first.
    if (sql.includes('FROM crsql_changes')) {
      // Drain pendingLocal as if it were a SELECT result
      const rows = fake.pendingLocal.map((r) => [
        r.table, r.pk, r.cid, r.val, r.col_version, r.db_version, r.site_id, r.cl, r.seq,
      ]);
      fake.pendingLocal = [];
      return rows;
    }
    if (sql.includes('crsql_db_version')) {
      return [[fake.localVersion]];
    }
    if (sql.includes('crsql_site_id')) {
      return [[new Uint8Array([1, 2, 3, 4])]];
    }
    if (sql.includes('MIN(last_db_version)')) {
      return [[0]];
    }
    return [];
  });

  fake.exec.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO crsql_changes')) {
      // Capture applied rows
      const [table, pk, cid, val, col_version, db_version, site_id, cl, seq] = params as [
        string, Uint8Array, string, unknown, number, number, Uint8Array, number, number,
      ];
      // Re-encode pk/site_id to base64 to match ChangeRow format
      const b64 = (b: Uint8Array) => {
        let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return btoa(s);
      };
      fake.applied.push({
        table,
        pk: b64(pk),
        cid,
        val: val as ChangeRow['val'],
        col_version,
        db_version,
        site_id: b64(site_id),
        cl,
        seq,
      });
    }
    // sync_relays UPDATEs are no-ops in the fake
  });

  return fake;
}

// ─── Crypto adapter ──────────────────────────────────────────────────────
function makeCrypto(): SyncCryptoAdapter {
  const masterKey = new Uint8Array(32).fill(0xAA);
  const sk = generateSecretKey();
  return {
    encrypt: (s) => encrypt(s, masterKey),
    decrypt: (s) => decrypt(s, masterKey),
    encryptForFeed: (s) => encrypt(s, masterKey),
    decryptForFeed: (s) => decrypt(s, masterKey),
    nostrPubKey: getPublicKey(sk),
    nostrPrivKey: sk,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────
describe('SyncEngine — local-loopback', () => {
  let hub: FakeRelay;
  let dbA: FakeDB;
  let dbB: FakeDB;
  let cryptoA: SyncCryptoAdapter;
  let cryptoB: SyncCryptoAdapter;
  let engineA: SyncEngine;
  let engineB: SyncEngine;

  beforeEach(async () => {
    hub = new FakeRelay();
    dbA = makeFakeDB();
    (dbA as any).__id = 'A';
    dbB = makeFakeDB();
    (dbB as any).__id = 'B';
    // Both engines share the same identity (cross-device sync of one user)
    cryptoA = makeCrypto();
    cryptoB = { ...cryptoA }; // same keys

    engineA = new SyncEngine({
      db: dbA as never,
      crypto: cryptoA,
      relayClient: new FakeRelayClient(hub) as never,
      batchWindowMs: 5,
    });
    engineB = new SyncEngine({
      db: dbB as never,
      crypto: cryptoB,
      relayClient: new FakeRelayClient(hub) as never,
      batchWindowMs: 5,
    });

    (engineA as any).__id = 'A';
    (engineB as any).__id = 'B';
    await engineA.start();
    await engineB.start();
  });

  it('propagates a local change from A to B', async () => {
    dbA.pendingLocal = [
      { table: 'notes', pk: 'aWQx', cid: 'content', val: 'hello', col_version: 1, db_version: 1, site_id: 'c2l0ZUE=', cl: 1, seq: 0 },
    ];
    dbA.triggerUpdate();
    await new Promise((r) => setTimeout(r, 30));

    expect(hub.events.length).toBeGreaterThanOrEqual(1);
    expect(dbB.applied.length).toBe(1);
    expect(dbB.applied[0].cid).toBe('content');
    expect(dbB.applied[0].val).toBe('hello');
  });

  it('does not re-apply own published events on the publishing device', async () => {
    dbA.pendingLocal = [
      { table: 'notes', pk: 'aWQy', cid: 'content', val: 'echo', col_version: 1, db_version: 2, site_id: 'c2l0ZUE=', cl: 1, seq: 0 },
    ];
    dbA.triggerUpdate();
    await new Promise((r) => setTimeout(r, 30));

    // A wrote it locally (already in its DB) and should NOT see it come back
    expect(dbA.applied.length).toBe(0);
    // B receives it
    expect(dbB.applied.length).toBe(1);
  });

  it('ignores duplicate event deliveries', async () => {
    dbA.pendingLocal = [
      { table: 'notes', pk: 'aWQz', cid: 'content', val: 'dup', col_version: 1, db_version: 3, site_id: 'c2l0ZUE=', cl: 1, seq: 0 },
    ];
    dbA.triggerUpdate();
    await new Promise((r) => setTimeout(r, 30));

    const before = dbB.applied.length;
    // Replay the same event manually
    const event = hub.events[hub.events.length - 1];
    hub.publish(event);
    await new Promise((r) => setTimeout(r, 10));
    expect(dbB.applied.length).toBe(before);
  });

  it('produces events of the right kind and channel tag', async () => {
    dbA.pendingLocal = [
      { table: 'notes', pk: 'aWQ0', cid: 'content', val: 'tag', col_version: 1, db_version: 4, site_id: 'c2l0ZUE=', cl: 1, seq: 0 },
    ];
    dbA.triggerUpdate();
    await new Promise((r) => setTimeout(r, 30));

    expect(hub.events[0].kind).toBe(SYNC_EVENT_KIND);
    expect(hub.events[0].tags.find((t) => t[0] === 'c')?.[1]).toBe('personal');
  });
});
