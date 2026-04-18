// Resolve delete-vs-edit conflicts produced by CR-SQLite's per-column LWW.
//
// Scenario:
//   Device A deletes a note  → sets is_deleted=1 with col_version N
//   Device B (offline) edits → sets content   with col_version M  (M > N)
// After merge, both operations are applied. CR-SQLite keeps is_deleted=1 AND
// the new content. UI filters WHERE is_deleted=0, so the user's edit appears
// lost even though it's in the DB.
//
// Policy (Sheafy): data preservation wins. An edit is a stronger signal of
// intent than a delete that happened before it, so we undelete the note.
//
// The pure logic lives in `computeUndeletes` so it can be unit-tested without
// spinning up CR-SQLite. `resolveDeleteEditConflicts` is the thin DB wrapper
// called after applying an incoming changeset.

import type { DB } from '@vlcn.io/crsqlite-wasm';

export interface ClockRow {
  noteId: string;
  cid: string;
  colVersion: number;
}

/** Columns whose bump means "the user edited this note". */
const EDIT_COLS = new Set(['content', 'properties']);

/**
 * Given the set of currently-deleted note ids and a flat list of per-column
 * clock entries, return the ids that should be undeleted because an edit
 * column has a higher col_version than `is_deleted`.
 */
export function computeUndeletes(
  deletedIds: Iterable<string>,
  clock: Iterable<ClockRow>,
): string[] {
  const deletedSet = new Set<string>(deletedIds);
  if (!deletedSet.size) return [];

  // noteId -> { isDeletedVersion, maxEditVersion }
  const perNote = new Map<string, { del?: number; edit?: number }>();

  for (const row of clock) {
    if (!deletedSet.has(row.noteId)) continue;
    let entry = perNote.get(row.noteId);
    if (!entry) { entry = {}; perNote.set(row.noteId, entry); }

    if (row.cid === 'is_deleted') {
      if (entry.del === undefined || row.colVersion > entry.del) entry.del = row.colVersion;
    } else if (EDIT_COLS.has(row.cid)) {
      if (entry.edit === undefined || row.colVersion > entry.edit) entry.edit = row.colVersion;
    }
  }

  const out: string[] = [];
  for (const [id, v] of perNote) {
    if (v.del !== undefined && v.edit !== undefined && v.edit > v.del) {
      out.push(id);
    }
  }
  return out;
}

/**
 * Query CR-SQLite's clock table and undelete any notes where a content/properties
 * edit has a higher col_version than `is_deleted`. Safe to call repeatedly;
 * a no-op when no conflicts exist. Errors are logged and swallowed — this runs
 * on every incoming changeset and must not break sync.
 */
export async function resolveDeleteEditConflicts(db: DB): Promise<string[]> {
  try {
    const deletedRows = (await db.execO(
      `SELECT id FROM notes WHERE is_deleted = 1`,
    )) as Array<{ id: string }>;
    if (!deletedRows.length) return [];

    // notes__crsql_clock schema: (key, __crsql_col_name, __crsql_col_version, ...)
    // `key` matches the PK column of `notes` (the `id` string).
    const clockRows = (await db.execO(
      `SELECT key AS noteId, __crsql_col_name AS cid, __crsql_col_version AS colVersion
         FROM notes__crsql_clock
        WHERE __crsql_col_name IN ('is_deleted', 'content', 'properties')`,
    )) as ClockRow[];

    const toUndelete = computeUndeletes(
      deletedRows.map((r) => r.id),
      clockRows,
    );
    if (!toUndelete.length) return [];

    // Reset is_deleted. This UPDATE will itself bump col_version on is_deleted,
    // propagating the undelete to peers on the next flush.
    const placeholders = toUndelete.map(() => '?').join(',');
    await db.exec(
      `UPDATE notes SET is_deleted = 0 WHERE id IN (${placeholders})`,
      toUndelete,
    );
    console.log('[sync] undeleted', toUndelete.length, 'notes with post-delete edits:', toUndelete);
    return toUndelete;
  } catch (err) {
    console.error('[sync] resolveDeleteEditConflicts failed', err);
    return [];
  }
}
