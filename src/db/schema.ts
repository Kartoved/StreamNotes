export const schema = [
  // Таблица заметок
  `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT,
      author_id TEXT,
      content TEXT,
      sort_key TEXT,
      view_mode TEXT DEFAULT 'list',
      created_at INTEGER,
      updated_at INTEGER,
      is_deleted BOOLEAN DEFAULT 0
  );`,
  // Индекс для быстрой группировки и сортировки элементов
  `CREATE INDEX IF NOT EXISTS idx_notes_parent_sort ON notes(parent_id, sort_key);`,
  // Магия CRDT: превращаем таблицу в Conflict-Free Replicated Relation
  `SELECT crsql_as_crr('notes');`,
  
  // Вспомогательная таблица для мгновенного поиска обратных ссылок (Backlinks)
  `CREATE TABLE IF NOT EXISTS links (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (source_id, target_id)
  );`,
  // Ее тоже синхронизируем как CRDT таблицу
  `SELECT crsql_as_crr('links');`
];
