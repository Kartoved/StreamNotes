import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDB } from './db/DBContext';
import { Feed, extractTags } from './components/Feed';
import { TweetEditor } from './components/TiptapEditor';
import { useNotes, useFeeds } from './db/hooks';
import type { Feed as FeedData } from './db/hooks';
import { useCrypto } from './crypto/CryptoContext';
import { isEncrypted } from './crypto/cipher';
import SettingsModal from './components/SettingsModal';
import { FeedsSidebar } from './layout/FeedsSidebar';
import { RightSidebar } from './layout/RightSidebar';
import './index.css';

// ─── Helpers ──────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).substring(2, 9);



// ─── App ──────────────────────────────────────────────────────────────
function App() {
  const db = useDB();
  const { encrypt, decrypt, nostrPubKey } = useCrypto();
  const [showSettings, setShowSettings] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (window as any).db = db; }, [db]);

  // ── E2E Migration: encrypt existing unencrypted data ──────────────
  const migrationDone = useRef(false);
  useEffect(() => {
    if (migrationDone.current) return;
    if (localStorage.getItem('sn_migration_done') === '1') { migrationDone.current = true; return; }
    migrationDone.current = true;
    (async () => {
      const notes = await db.execO(`SELECT id, content, properties FROM notes`) as any[];
      for (const n of notes) {
        if (n.content && !isEncrypted(n.content)) {
          await db.exec(`UPDATE notes SET content = ?, properties = ? WHERE id = ?`,
            [encrypt(n.content), encrypt(n.properties || '{}'), n.id]);
        }
      }
      const feedRows = await db.execO(`SELECT id, name, avatar FROM feeds`) as any[];
      for (const f of feedRows) {
        if (f.name && !isEncrypted(f.name)) {
          await db.exec(`UPDATE feeds SET name = ?, avatar = ? WHERE id = ?`,
            [encrypt(f.name), f.avatar ? encrypt(f.avatar) : null, f.id]);
        }
      }
      localStorage.setItem('sn_migration_done', '1');
    })();
  }, [db, encrypt]);

  // ── Feeds ──────────────────────────────────────────────────────────
  const feeds = useFeeds();
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null);

  // Auto-create default feed and set active on first load
  useEffect(() => {
    if (feeds.length > 0 && !activeFeedId) {
      setActiveFeedId(feeds[0].id);
    }
  }, [feeds, activeFeedId]);

  useEffect(() => {
    if (feeds.length === 0) return;
    (async () => {
      const existing = await db.execO(`SELECT id FROM feeds LIMIT 1`);
      if ((existing as any[]).length === 0) {
        const id = 'feed-' + uid();
        await db.exec(
          `INSERT INTO feeds (id, name, color, created_at) VALUES (?,?,?,?)`,
          [id, encrypt('Главная'), '#3b82f6', Date.now()]
        );
      }
    })();
  }, [db, encrypt]);

  // Auto-create default feed on very first load (feeds is empty)
  const defaultFeedCreated = useRef(false);
  useEffect(() => {
    if (defaultFeedCreated.current) return;
    defaultFeedCreated.current = true;
    (async () => {
      const existing = await db.execO(`SELECT id FROM feeds LIMIT 1`);
      if ((existing as any[]).length === 0) {
        const id = 'feed-' + uid();
        const now = Date.now();
        await db.exec(
          `INSERT INTO feeds (id, name, color, created_at) VALUES (?,?,?,?)`,
          [id, encrypt('Главная'), '#3b82f6', now]
        );
        setActiveFeedId(id);
      }
    })();
  }, [db]);

  const handleCreateFeed = useCallback(async (name: string, color: string, avatar: string | null) => {
    const id = 'feed-' + uid();
    await db.exec(
      `INSERT INTO feeds (id, name, color, avatar, created_at) VALUES (?,?,?,?,?)`,
      [id, encrypt(name), color, avatar ? encrypt(avatar) : null, Date.now()]
    );
    setActiveFeedId(id);
  }, [db, encrypt]);

  const handleUpdateFeed = useCallback(async (id: string, name: string, color: string, avatar: string | null) => {
    await db.exec(`UPDATE feeds SET name = ?, color = ?, avatar = ? WHERE id = ?`, [encrypt(name), color, avatar ? encrypt(avatar) : null, id]);
  }, [db, encrypt]);

  const handleDeleteFeed = useCallback(async (id: string) => {
    await db.exec(`DELETE FROM feeds WHERE id = ?`, [id]);
    await db.exec(`DELETE FROM notes WHERE feed_id = ?`, [id]);
    if (activeFeedId === id) setActiveFeedId(feeds.find(f => f.id !== id)?.id ?? null);
  }, [db, activeFeedId, feeds]);

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

  // ── Sidebar filters ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const allNotes = useNotes(null, activeFeedId);

  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    allNotes.forEach(n => extractTags(n.content).forEach(t => s.add(t)));
    return [...s].sort();
  }, [allNotes]);

  const activeDays = React.useMemo(() => {
    const s = new Set<string>();
    allNotes.forEach(n => s.add(new Date(n.created_at).toISOString().slice(0, 10)));
    return s;
  }, [allNotes]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  // ── CRUD ───────────────────────────────────────────────────────────
  const insertRootNote = async (astText: string, propsJson: string) => {
    if (!activeFeedId) return;
    const id = 'note-' + uid();
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, focusedTweetId, 'local-user', encrypt(astText), now.toString(), encrypt(propsJson), activeFeedId, now, now]
    );
  };

  const handleInlineReply = async (parentId: string, astText: string, propsJson: string) => {
    if (!activeFeedId) return;
    const id = 'note-' + uid();
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, parentId, 'local-user', encrypt(astText), now.toString(), encrypt(propsJson), activeFeedId, now, now]
    );
    setReplyingToTweetId(null);
  };

  const handleEditSubmit = async (noteId: string, astText: string, propsJson: string) => {
    await db.exec(
      `UPDATE notes SET content = ?, properties = ?, updated_at = ? WHERE id = ?`,
      [encrypt(astText), encrypt(propsJson), Date.now(), noteId]
    );
    setEditingTweet(null);
  };

  // ── Export / Import ────────────────────────────────────────────────
  const handleExport = async () => {
    const rows = await db.execO(`SELECT * FROM notes WHERE is_deleted = 0`) as any[];
    const decryptedRows = rows.map(r => ({
      ...r,
      content: decrypt(r.content),
      properties: decrypt(r.properties),
    }));
    const feedRows = await db.execO(`SELECT * FROM feeds`) as any[];
    const decryptedFeeds = feedRows.map(f => ({
      ...f,
      name: decrypt(f.name),
      avatar: f.avatar ? decrypt(f.avatar) : null,
    }));
    const payload = JSON.stringify({ version: 1, notes: decryptedRows, feeds: decryptedFeeds }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `streamnotes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      // Support both old format (array) and new format ({ version, notes, feeds })
      const notes: any[] = Array.isArray(data) ? data : (data.notes || []);
      const importFeeds: any[] = Array.isArray(data) ? [] : (data.feeds || []);
      for (const f of importFeeds) {
        await db.exec(
          `INSERT OR IGNORE INTO feeds (id, name, color, avatar, created_at) VALUES (?,?,?,?,?)`,
          [f.id, encrypt(f.name), f.color, f.avatar ? encrypt(f.avatar) : null, f.created_at]
        );
      }
      for (const n of notes) {
        await db.exec(
          `INSERT OR IGNORE INTO notes (id, parent_id, author_id, content, sort_key, properties, view_mode, feed_id, created_at, updated_at, is_deleted) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [n.id, n.parent_id, n.author_id, encrypt(n.content), n.sort_key, encrypt(n.properties || '{}'), n.view_mode || 'list', n.feed_id || activeFeedId, n.created_at, n.updated_at, n.is_deleted || 0]
        );
      }
      alert(`Импортировано ${notes.length} заметок`);
    } catch (err) { alert('Ошибка: ' + String(err)); }
    e.target.value = '';
  };

  const activeFeed = feeds.find(f => f.id === activeFeedId);

  const iconBtn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-muted)', padding: '2px 9px', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Feeds sidebar ── */}
      <FeedsSidebar
        feeds={feeds}
        activeFeedId={activeFeedId}
        onSelect={id => { setActiveFeedId(id); setFocusedTweetId(null); setReplyingToTweetId(null); }}
        onCreateFeed={handleCreateFeed}
        onUpdateFeed={handleUpdateFeed}
        onDeleteFeed={handleDeleteFeed}
      />

      {/* ── Main content ── */}
      <div className="main-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '0.75rem 1rem', boxSizing: 'border-box', alignItems: 'center' }}>
        {/* Header */}
        <header className="app-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.75rem', flexShrink: 0, width: '100%', maxWidth: '980px' }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', background: '-webkit-linear-gradient(45deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', flexShrink: 0 }}>
            {activeFeed?.name || 'StreamNotes'}
          </h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
            {focusedTweetId ? 'Ветка обсуждения' : 'Главная лента'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {nostrPubKey && (
              <span
                onClick={() => setShowSettings(true)}
                style={{ fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px' }}
              >
                {nostrPubKey.slice(0, 6)}…{nostrPubKey.slice(-4)}
              </span>
            )}
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={iconBtn}>{theme === 'dark' ? '☀' : '🌙'}</button>
            <button onClick={handleExport} style={iconBtn}>↑ Export</button>
            <label style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              ↓ Import<input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            </label>
            <button onClick={() => setShowSettings(true)} style={iconBtn}>⚙</button>
            {focusedTweetId && (
              <button onClick={() => { setFocusedTweetId(null); setReplyingToTweetId(null); }} style={{ ...iconBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>← В корень</button>
            )}
          </div>
        </header>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

        {/* Main layout: feed + right sidebar */}
        <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0, width: '100%', maxWidth: '980px' }}>
          {/* Editor + Feed */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ flexShrink: 0 }}>
              <TweetEditor
                placeholder={focusedTweetId ? 'Оставить ответ в ветке...' : 'Что происходит?'}
                buttonText="Твитнуть"
                onSubmit={insertRootNote}
                autoFocus
              />
            </div>
            <Feed
              parentId={focusedTweetId}
              feedId={activeFeedId}
              onNoteClick={(id) => { setFocusedTweetId(id); setReplyingToTweetId(null); }}
              replyingToId={replyingToTweetId}
              editingNote={editingTweet}
              onStartReply={setReplyingToTweetId}
              onCancelReply={() => setReplyingToTweetId(null)}
              onSubmitReply={handleInlineReply}
              onStartEdit={setEditingTweet}
              onCancelEdit={() => setEditingTweet(null)}
              onSubmitEdit={handleEditSubmit}
              searchQuery={searchQuery}
              selectedTags={selectedTags}
              selectedDate={selectedDate}
            />
          </div>

          <RightSidebar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            activeDays={activeDays}
            allTags={allTags}
            selectedTags={selectedTags}
            toggleTag={toggleTag}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
