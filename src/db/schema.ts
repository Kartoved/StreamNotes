export const schema = [
  `CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT DEFAULT '',
    avatar TEXT DEFAULT NULL,
    color TEXT DEFAULT '#3b82f6',
    encryption_key TEXT DEFAULT NULL,
    key_index INTEGER DEFAULT NULL,
    is_shared BOOLEAN DEFAULT 0,
    created_at INTEGER DEFAULT 0
  );`,
  `SELECT crsql_as_crr('feeds');`,

  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    parent_id TEXT DEFAULT NULL,
    author_id TEXT DEFAULT 'local-user',
    content TEXT DEFAULT '',
    sort_key TEXT DEFAULT '',
    properties TEXT DEFAULT '{}',
    view_mode TEXT DEFAULT 'list',
    feed_id TEXT DEFAULT NULL,
    created_at INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT 0,
    is_deleted BOOLEAN DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_notes_parent_sort ON notes(parent_id, sort_key);`,
  `CREATE INDEX IF NOT EXISTS idx_notes_feed ON notes(feed_id);`,
  `SELECT crsql_as_crr('notes');`,

  `CREATE TABLE IF NOT EXISTS links (
    source_id TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (source_id, target_id)
  );`,
  `SELECT crsql_as_crr('links');`
];

// Migrations for existing databases — run after schema creation
export const migrations = [
  // v2: Per-feed encryption keys and sharing
  `ALTER TABLE feeds ADD COLUMN encryption_key TEXT DEFAULT NULL;`,
  `ALTER TABLE feeds ADD COLUMN key_index INTEGER DEFAULT NULL;`,
  `ALTER TABLE feeds ADD COLUMN is_shared BOOLEAN DEFAULT 0;`,
];
