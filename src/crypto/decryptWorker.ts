// Main-thread orchestrator for the decrypt worker.
//
// Singleton: created on first init, terminated on logout.
// Falls back to no-worker mode (useNotes will keep using sync decrypt)
// if the worker fails to spin up — never breaks the app.

let worker: Worker | null = null;
let nextReqId = 1;
const pending = new Map<number, (data: any) => void>();
let initialised = false;
let initFailed = false;

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (initFailed) return null;
  try {
    // Vite handles ?worker imports; module type avoids transpile of imports.
    const mod = new Worker(
      new URL('../workers/decrypt.worker.ts', import.meta.url),
      { type: 'module' },
    );
    mod.onmessage = (e) => {
      const cb = pending.get(e.data.reqId);
      if (cb) {
        pending.delete(e.data.reqId);
        cb(e.data);
      }
    };
    mod.onerror = () => { initFailed = true; };
    worker = mod;
    return mod;
  } catch {
    initFailed = true;
    return null;
  }
}

function post(msg: any): Promise<any> | null {
  const w = ensureWorker();
  if (!w) return null;
  const reqId = nextReqId++;
  return new Promise((resolve) => {
    pending.set(reqId, resolve);
    w.postMessage({ ...msg, reqId });
  });
}

export async function initDecryptWorker(
  master: Uint8Array,
  perFeed: Map<string, Uint8Array>,
  shared: Set<string>,
): Promise<boolean> {
  const p = post({
    type: 'init',
    master,
    perFeed: Array.from(perFeed.entries()),
    shared: Array.from(shared),
  });
  if (!p) return false;
  await p;
  initialised = true;
  return true;
}

export function isWorkerReady(): boolean {
  return initialised && !initFailed;
}

export function pushFeedKey(feedId: string, fek: Uint8Array): void {
  if (!initialised) return;
  // Fire and forget — useNotes only kicks off after init() resolves and
  // any FEK that arrives later will be re-queried on the next refetch.
  post({ type: 'addFeedKey', feedId, fek });
}

export function pushSharedFeed(feedId: string): void {
  if (!initialised) return;
  post({ type: 'markShared', feedId });
}

export interface DecryptRequest {
  id: string;
  encContent: string;
  encProperties: string;
  feedId: string | null;
}

export interface DecryptResult {
  id: string;
  content: string;
  properties: string;
  ok: boolean;
}

export async function decryptBatchInWorker(rows: DecryptRequest[]): Promise<DecryptResult[] | null> {
  if (!initialised || rows.length === 0) return null;
  const p = post({ type: 'decrypt', rows });
  if (!p) return null;
  const result = await p;
  return result.rows as DecryptResult[];
}

export function terminateDecryptWorker(): void {
  if (worker) {
    try { worker.terminate(); } catch { /* ignore */ }
    worker = null;
  }
  pending.clear();
  initialised = false;
  initFailed = false;
}
