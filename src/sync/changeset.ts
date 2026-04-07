// Capture and apply CR-SQLite CRDT changesets.
//
// CR-SQLite exposes `crsql_changes` as a virtual table where each row is a
// single column-level CRDT operation. Pulling deltas is a SELECT; applying
// remote deltas is an INSERT into the same virtual table.
//
// Loop avoidance: when capturing, we filter `site_id = crsql_site_id()` so we
// only export changes that originated locally. Remote changes inserted via
// `applyChanges` are stored with their original `site_id`, so a subsequent
// `captureChanges` call will not re-export them.

import type { DB } from '@vlcn.io/crsqlite-wasm';
import type { ChangeRow, Changeset, SqlValue } from './types';

const COLUMNS = [
  '"table"',
  '"pk"',
  '"cid"',
  '"val"',
  '"col_version"',
  '"db_version"',
  '"site_id"',
  '"cl"',
  '"seq"',
];

// ─── BLOB <-> base64 helpers ──────────────────────────────────────────────
// We can't put raw Uint8Array into JSON, so BLOB columns (pk, site_id) and
// any BLOB-typed `val` are base64-encoded. The discriminator on values is
// the `{ __blob_b64 }` shape so the receiver can faithfully restore them.

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeMaybeBlob(v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Uint8Array) return { __blob_b64: bytesToBase64(v) };
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  // Fallback: stringify (shouldn't happen for SQLite-backed data)
  return String(v);
}

function decodeMaybeBlob(v: SqlValue): unknown {
  if (v === null) return null;
  if (typeof v === 'object' && v !== null && '__blob_b64' in v) {
    return base64ToBytes(v.__blob_b64);
  }
  return v;
}

function encodeBlob(v: unknown): string {
  if (v instanceof Uint8Array) return bytesToBase64(v);
  // Some drivers return BLOBs as strings of char codes
  if (typeof v === 'string') {
    const out = new Uint8Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v.charCodeAt(i) & 0xff;
    return bytesToBase64(out);
  }
  if (v == null) return '';
  return bytesToBase64(new Uint8Array(0));
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Read this DB's site_id (base64). Useful for callers that want to filter. */
export async function getSiteId(db: DB): Promise<string> {
  const rows = await db.execA(`SELECT crsql_site_id()`);
  const raw = rows[0]?.[0];
  return encodeBlob(raw);
}

/** Read this DB's current db_version (highest applied). */
export async function getDbVersion(db: DB): Promise<number> {
  const rows = await db.execA(`SELECT crsql_db_version()`);
  const v = rows[0]?.[0];
  return typeof v === 'bigint' ? Number(v) : Number(v ?? 0);
}

/**
 * Capture all locally-originated changes with `db_version > sinceVersion`.
 * Returns the new high-water-mark and the changeset (possibly empty).
 */
export async function captureChanges(
  db: DB,
  sinceVersion: number,
): Promise<{ changeset: Changeset; newVersion: number }> {
  const rows = await db.execA<unknown[]>(
    `SELECT ${COLUMNS.join(', ')}
     FROM crsql_changes
     WHERE db_version > ? AND site_id = crsql_site_id()
     ORDER BY db_version, seq`,
    [sinceVersion],
  );

  let newVersion = sinceVersion;
  const out: ChangeRow[] = [];
  for (const r of rows) {
    const dbv = typeof r[5] === 'bigint' ? Number(r[5]) : Number(r[5]);
    if (dbv > newVersion) newVersion = dbv;
    out.push({
      table: String(r[0]),
      pk: encodeBlob(r[1]),
      cid: String(r[2]),
      val: encodeMaybeBlob(r[3]),
      col_version: typeof r[4] === 'bigint' ? Number(r[4]) : Number(r[4]),
      db_version: dbv,
      site_id: encodeBlob(r[6]),
      cl: typeof r[7] === 'bigint' ? Number(r[7]) : Number(r[7]),
      seq: typeof r[8] === 'bigint' ? Number(r[8]) : Number(r[8]),
    });
  }

  return { changeset: { v: 1, rows: out }, newVersion };
}

/**
 * Apply a remote changeset to this DB. CR-SQLite handles conflict resolution
 * automatically (last-writer-wins per column, with vector clocks).
 *
 * Each row carries its original `site_id` so it will not be re-captured by
 * `captureChanges` (which filters on local site_id only).
 */
export async function applyChanges(db: DB, changeset: Changeset): Promise<void> {
  if (!changeset.rows.length) return;

  // Validate version once up-front
  if (changeset.v !== 1) {
    throw new Error(`Unknown changeset version: ${(changeset as { v: number }).v}`);
  }

  // Whitelist of tables we are willing to accept changes for. Anything else
  // (e.g. sync_relays — device-local) is dropped silently to avoid pulling in
  // junk from a malicious or buggy peer.
  const ALLOWED = new Set(['notes', 'feeds', 'links']);

  for (const r of changeset.rows) {
    if (!ALLOWED.has(r.table)) continue;
    const pk = base64ToBytes(r.pk);
    const siteId = base64ToBytes(r.site_id);
    const val = decodeMaybeBlob(r.val);
    await db.exec(
      `INSERT INTO crsql_changes
         ("table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl", "seq")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.table, pk, r.cid, val as never, r.col_version, r.db_version, siteId, r.cl, r.seq],
    );
  }
}
