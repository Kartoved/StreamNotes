// Optimistic insert layer for instant feedback after Enter / Reply.
//
// App.tsx adds a fully-formed Note here BEFORE awaiting the SQLite INSERT.
// useNotes merges the layer into its result and subscribes to updates so
// the new card appears in the same React tick the user submitted in.
//
// When the next real fetch returns rows whose ids match an optimistic
// entry, that entry is reconciled away — the cached/decrypted version
// from useNotes takes over with no flicker (same id => same React key).

import type { Note } from './hooks';

const layer = new Map<string, Note>();
const listeners = new Set<() => void>();

export function addOptimistic(note: Note): void {
  layer.set(note.id, note);
  notify();
}

export function removeOptimistic(id: string): void {
  if (layer.delete(id)) notify();
}

/** Returns the optimistic notes that match the current view. */
export function getOptimisticFor(parentId: string | null, feedId: string | null): Note[] {
  if (layer.size === 0) return [];
  const out: Note[] = [];
  for (const note of layer.values()) {
    // Match the same scoping the CTE uses in useNotes.
    if (parentId) {
      // Thread view: include if note is the root or a descendant.
      // We can't trace the chain here without DB access; show only direct
      // children of parentId or the parent itself.
      if (note.id !== parentId && note.parent_id !== parentId) continue;
    } else if (feedId) {
      if (note.feed_id !== feedId) continue;
    }
    out.push(note);
  }
  return out;
}

export function subscribeOptimistic(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Drop optimistic entries that are now present in real fetched rows. */
export function reconcileOptimistic(realIds: Set<string>): void {
  let changed = false;
  for (const id of layer.keys()) {
    if (realIds.has(id)) {
      layer.delete(id);
      changed = true;
    }
  }
  if (changed) notify();
}

export function clearOptimistic(): void {
  if (layer.size > 0) {
    layer.clear();
    notify();
  }
}

function notify(): void {
  listeners.forEach(fn => fn());
}
