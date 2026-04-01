import React, { useState, useRef, useEffect } from 'react';
import { useDB } from './db/DBContext';
import { Feed } from './components/Feed';
import { TweetEditor } from './components/TiptapEditor';
import './index.css';

function App() {
  const db = useDB();
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (window as any).db = db;
  }, [db]);

  // ── Theme ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ── Note state ─────────────────────────────────────────────────────
  const [focusedTweetId, setFocusedTweetId] = useState<string | null>(null);
  const [replyingToTweetId, setReplyingToTweetId] = useState<string | null>(null);
  const [editingTweet, setEditingTweet] = useState<any>(null);

  const insertRootNote = async (astText: string, propsJson: string) => {
    const id = "note-" + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    await db.exec(`
      INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, focusedTweetId, 'local-user', astText, Date.now().toString(), propsJson, now, now]
    );
  };

  const handleInlineReply = async (parentId: string, astText: string, propsJson: string) => {
    const id = "note-" + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    await db.exec(`
      INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, parentId, 'local-user', astText, Date.now().toString(), propsJson, now, now]
    );
    setReplyingToTweetId(null);
  };

  const handleEditSubmit = async (noteId: string, astText: string, propsJson: string) => {
    const now = Date.now();
    await db.exec(`
      UPDATE notes SET content = ?, properties = ?, updated_at = ?
      WHERE id = ?`,
      [astText, propsJson, now, noteId]
    );
    setEditingTweet(null);
  };

  // ── Export / Import ────────────────────────────────────────────────
  const handleExport = async () => {
    const allNotes = await db.execO(`SELECT * FROM notes WHERE is_deleted = 0`);
    const blob = new Blob(
      [JSON.stringify(allNotes, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `streamnotes-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const notes: any[] = JSON.parse(text);
      let imported = 0;
      for (const n of notes) {
        await db.exec(
          `INSERT OR IGNORE INTO notes (id, parent_id, author_id, content, sort_key, properties, view_mode, created_at, updated_at, is_deleted)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [n.id, n.parent_id, n.author_id, n.content, n.sort_key,
           n.properties || '{}', n.view_mode || 'list', n.created_at, n.updated_at, n.is_deleted || 0]
        );
        imported++;
      }
      alert(`Импортировано ${imported} заметок`);
    } catch (err) {
      alert('Ошибка импорта: ' + String(err));
    }
    e.target.value = '';
  };

  // ── Styles ─────────────────────────────────────────────────────────
  const iconBtn: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    padding: '2px 9px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.78rem',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="app-container">
      <header style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', background: '-webkit-linear-gradient(45deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', flexShrink: 0 }}>
            StreamNotes
          </h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
            {focusedTweetId ? 'Ветка обсуждения' : 'Главная лента'}
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={iconBtn} title="Сменить тему">
              {theme === 'dark' ? '☀' : '🌙'}
            </button>
            <button onClick={handleExport} style={iconBtn} title="Экспорт JSON">
              ↑ Export
            </button>
            <label style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center' }} title="Импорт JSON">
              ↓ Import
              <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            </label>
            {focusedTweetId && (
              <button
                onClick={() => { setFocusedTweetId(null); setReplyingToTweetId(null); }}
                style={{ ...iconBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                ← В корень
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        <div style={{ marginBottom: '0.75rem' }}>
          <TweetEditor
            placeholder={focusedTweetId ? "Оставить ответ в ветке..." : "Что происходит?"}
            buttonText="Твитнуть"
            onSubmit={insertRootNote}
            autoFocus={true}
          />
        </div>

        <Feed
          parentId={focusedTweetId}
          onNoteClick={(id) => { setFocusedTweetId(id); setReplyingToTweetId(null); }}
          replyingToId={replyingToTweetId}
          editingNote={editingTweet}
          onStartReply={setReplyingToTweetId}
          onCancelReply={() => setReplyingToTweetId(null)}
          onSubmitReply={handleInlineReply}
          onStartEdit={setEditingTweet}
          onCancelEdit={() => setEditingTweet(null)}
          onSubmitEdit={handleEditSubmit}
        />
      </main>
    </div>
  );
}

export default App;
