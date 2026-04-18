// Tests for SyncEngine.flushNow() — the synchronous-flush API used before
// destructive local ops (hard delete) to guarantee changesets reached the relay.
//
// Uses the same fake DB / fake relay scaffolding as syncEngine.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { Event } from 'nostr-tools/core';
import type { Filter } from 'nostr-tools/filter';
import { encrypt, decrypt } from '../../crypto/cipher';
import { SyncEngine, type SyncCryptoAdapter } from '../../sync/syncEngine';
import type { ChangeRow } from '../../sync/types';

class FakeRelay {
  subs: Array<{ filter: Filter; cb: (e: Event) => void }> = [];
  events: Event[] = [];
  publishDelayMs = 0;
  publishShouldFail = false;

  async publish(event: Event) {
    if (this.publishDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.publishDelayMs));
    }
    if (this.publishShouldFail) throw new Error('relay unreachable');
    this.events.push(event);
    for (const s of this.subs) {
      if (this.matches(s.filter, event)) s.cb(event);
    }
  }

  private matches(filter: Filter, event: Event): boolean {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
    return true;
  }

  subscribe(filter: Filter, cb: (e: Event) => void): () => void {
    const entry = { filter, cb };
    this.subs.push(entry);
    return () => { this.subs = this.subs.filter((s) => s !== entry); };
  }
}

class FakeRelayClient {
  constructor(private hub: FakeRelay) {}
  setRelays(_u: string[]) { /* noop */ }
  getRelays() { return ['wss://fake']; }
  publish(e: Event) { return this.hub.publish(e); }
  subscribe(f: Filter, cb: (e: Event) => void) { return this.hub.subscribe(f, cb); }
  destroy() { /* noop */ }
}

interface FakeDB {
  pendingLocal: ChangeRow[];
  exec: ReturnType<typeof vi.fn>;
  execA: ReturnType<typeof vi.fn>;
  execO: ReturnType<typeof vi.fn>;
  onUpdate: ReturnType<typeof vi.fn>;
  triggerUpdate: () => void;
}

function makeFakeDB(): FakeDB {
  const cbs: Array<(t: number, d: string, tbl: string, r: bigint) => void> = [];
  const fake: FakeDB = {
    pendingLocal: [],
    exec: vi.fn().mockResolvedValue(undefined),
    execA: vi.fn(),
    execO: vi.fn(),
    onUpdate: vi.fn((cb: any) => { cbs.push(cb); return () => {}; }),
    triggerUpdate: () => { for (const cb of cbs) cb(18, 'main', 'notes', 1n); },
  };

  fake.execO.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM sync_relays')) {
      return [{ url: 'wss://fake', is_active: 1, last_db_version: 0, last_event_at: 0, added_at: 0 }];
    }
    if (sql.includes('FROM feeds')) return [];
    if (sql.includes('SELECT id, feed_id FROM notes')) return [];
    return [];
  });

  fake.execA.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM crsql_changes')) {
      const rows = fake.pendingLocal.map((r) => [
        r.table, r.pk, r.cid, r.val, r.col_version, r.db_version, r.site_id, r.cl, r.seq,
      ]);
      fake.pendingLocal = [];
      return rows;
    }
    if (sql.includes('crsql_db_version')) return [[0]];
    if (sql.includes('crsql_site_id')) return [[new Uint8Array([1, 2, 3, 4])]];
    if (sql.includes('MIN(last_db_version)')) return [[0]];
    return [];
  });

  return fake;
}

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

describe('SyncEngine.flushNow', () => {
  let hub: FakeRelay;
  let db: FakeDB;
  let engine: SyncEngine;

  beforeEach(async () => {
    hub = new FakeRelay();
    db = makeFakeDB();
    engine = new SyncEngine({
      db: db as never,
      crypto: makeCrypto(),
      relayClient: new FakeRelayClient(hub) as never,
      batchWindowMs: 5000, // long window so only flushNow triggers send
    });
    await engine.start();
  });

  it('resolves only AFTER publish completes', async () => {
    hub.publishDelayMs = 100;
    db.pendingLocal = [
      { table: 'notes', pk: 'aWQx', cid: 'is_deleted', val: 1, col_version: 1, db_version: 1, site_id: 'c2l0ZUE=', cl: 1, seq: 0 },
    ];

    const before = Date.now();
    const flushPromise = engine.flushNow();

    // Immediately after calling, publish has not finished yet
    expect(hub.events.length).toBe(0);

    await flushPromise;
    const elapsed = Date.now() - before;

    // publish took ~100ms; flushNow must have waited
    expect(hub.events.length).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it('rejects when publish fails', async () => {
    hub.publishShouldFail = true;
    db.pendingLocal = [
      { table: 'notes', pk: 'aWQy', cid: 'content', val: 'x', col_version: 1, db_version: 2, site_id: 'c2l0ZUE=', cl: 1, seq: 0 },
    ];

    await expect(engine.flushNow()).rejects.toThrow('relay unreachable');
    expect(hub.events.length).toBe(0);
  });

  it('resolves immediately with nothing to publish', async () => {
    // No pending rows
    await expect(engine.flushNow()).resolves.toBeUndefined();
    expect(hub.events.length).toBe(0);
  });

  it('waits for an in-flight debounced flush before running a fresh pass', async () => {
    hub.publishDelayMs = 50;
    db.pendingLocal = [
      { table: 'notes', pk: 'aWQz', cid: 'content', val: 'first', col_version: 1, db_version: 3, site_id: 'c2l0ZUE=', cl: 1, seq: 0 },
    ];
    // Trigger the debounced path
    db.triggerUpdate();
    // Give the scheduler one tick
    await new Promise((r) => setTimeout(r, 10));

    // flushNow should still succeed (wait for running one, then pass is a no-op since pendingLocal drained)
    await engine.flushNow();
    expect(hub.events.length).toBeGreaterThanOrEqual(1);
  });
});
