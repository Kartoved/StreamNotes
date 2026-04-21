// Lightweight EventTarget split out of syncEngine.ts so consumers (db/hooks,
// nickname listener) can subscribe without pulling in nostr-tools at module
// init. The engine itself is dynamically imported on idle.
export const SyncEvents = new EventTarget();
