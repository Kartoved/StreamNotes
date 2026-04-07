// Types for the Nostr-relay sync layer.
// See: plan at .claude/plans/fuzzy-splashing-quasar.md

/**
 * One row from CR-SQLite's `crsql_changes` virtual table.
 * Represents a single column-level CRDT operation.
 *
 * BLOB columns (`pk`, `site_id`) are base64-encoded for JSON transport.
 * `val` is whatever SQLite type the column holds (string | number | null | base64-blob).
 */
export interface ChangeRow {
  table: string;
  pk: string;          // base64(BLOB)
  cid: string;
  val: SqlValue;
  col_version: number;
  db_version: number;
  site_id: string;     // base64(BLOB)
  cl: number;
  seq: number;
}

export type SqlValue = string | number | null | { __blob_b64: string };

/** A batch of CRDT changes that travel together over the wire. */
export interface Changeset {
  v: 1;
  rows: ChangeRow[];
}

/** Which encryption channel an event belongs to. */
export type Channel = 'personal' | 'feed';

/** Per-relay state stored in the `sync_relays` table. */
export interface RelayState {
  url: string;
  is_active: number;
  last_db_version: number;
  last_event_at: number;
  added_at: number;
}

/** Custom Nostr event kind used for StreamNotes sync. */
export const SYNC_EVENT_KIND = 1314;
