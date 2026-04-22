// AES/XChaCha20-Poly1305 batch decrypt worker.
//
// Holds the master content key + per-feed FEKs in worker memory. The
// CryptoContext mirrors every key registration here via postMessage so
// useNotes can offload bulk decrypt off the main thread.
//
// On cache miss for ~3000 rows the worker keeps the UI responsive
// during the ~600–1800 ms of crypto work.

import { decrypt } from '../crypto/cipher';

let masterKey: Uint8Array | null = null;
const feedKeys = new Map<string, Uint8Array>();
const sharedFeeds = new Set<string>();

interface DecryptRow {
  id: string;
  encContent: string;
  encProperties: string;
  feedId: string | null;
}

function pickKey(feedId: string | null): Uint8Array | null {
  if (feedId && feedKeys.has(feedId)) return feedKeys.get(feedId)!;
  // Shared feed without a known FEK: refuse — never silently fall back to
  // the master key (would produce garbage and confuse the user).
  if (feedId && sharedFeeds.has(feedId)) return null;
  return masterKey;
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  const { type, reqId } = msg;

  if (type === 'init') {
    masterKey = msg.master as Uint8Array;
    feedKeys.clear();
    sharedFeeds.clear();
    for (const [k, v] of msg.perFeed as Array<[string, Uint8Array]>) feedKeys.set(k, v);
    for (const id of msg.shared as string[]) sharedFeeds.add(id);
    (self as any).postMessage({ reqId, type: 'ack' });
    return;
  }

  if (type === 'addFeedKey') {
    feedKeys.set(msg.feedId, msg.fek);
    sharedFeeds.add(msg.feedId);
    (self as any).postMessage({ reqId, type: 'ack' });
    return;
  }

  if (type === 'markShared') {
    sharedFeeds.add(msg.feedId);
    (self as any).postMessage({ reqId, type: 'ack' });
    return;
  }

  if (type === 'decrypt') {
    const rows: DecryptRow[] = msg.rows;
    const out = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = pickKey(row.feedId);
      if (!key) {
        out[i] = { id: row.id, content: '[Ошибка расшифровки]', properties: '{}', ok: false };
        continue;
      }
      try {
        out[i] = {
          id: row.id,
          content: decrypt(row.encContent, key),
          properties: decrypt(row.encProperties, key),
          ok: true,
        };
      } catch {
        out[i] = { id: row.id, content: '[Ошибка расшифровки]', properties: '{}', ok: false };
      }
    }
    (self as any).postMessage({ reqId, type: 'result', rows: out });
    return;
  }
};
