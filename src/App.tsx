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

  // ── Color migration: replace old default blue with neutral gray ────
  const colorMigrationDone = useRef(false);
  useEffect(() => {
    if (colorMigrationDone.current) return;
    if (localStorage.getItem('sn_color_migration_v1') === '1') { colorMigrationDone.current = true; return; }
    colorMigrationDone.current = true;
    (async () => {
      // Replace old neon defaults with neutral tones
      const oldBlues = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
      const neutral = ['#787774', '#606a7b', '#969591', '#37352f', '#868e96', '#b1b1ae', '#a3a6ad', '#c9cbd0'];
      const feeds = await db.execO(`SELECT id, color FROM feeds`) as any[];
      for (const f of feeds) {
        const idx = oldBlues.indexOf(f.color);
        if (idx !== -1) {
          await db.exec(`UPDATE feeds SET color = ? WHERE id = ?`, [neutral[idx], f.id]);
        }
      }
      localStorage.setItem('sn_color_migration_v1', '1');
    })();
  }, [db]);

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
        const now = Date.now();
        await db.exec(
          `INSERT INTO feeds (id, name, color, created_at) VALUES (?,?,?,?)`,
          [id, encrypt('Главная'), '#787774', now]
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
  // Force light theme for the new minimalist design (reset old localStorage)
  const DESIGN_VERSION = 'minimalist-v1';
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (localStorage.getItem('design_version') !== DESIGN_VERSION) {
      localStorage.setItem('design_version', DESIGN_VERSION);
      localStorage.setItem('theme', 'light');
      return 'light';
    }
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ── Note state ─────────────────────────────────────────────────────
  const [focusedTweetId, setFocusedTweetId] = useState<string | null>(null);
  const [replyingToTweetId, setReplyingToTweetId] = useState<string | null>(null);
  const [editingTweet, setEditingTweet] = useState<any>(null);
  const [fullscreenDraft, setFullscreenDraft] = useState<{ ast: string; propsJson: string; onSubmit: (ast: string, pj: string) => void } | null>(null);

  const handleExpandEditor = (ast: string, propsJson: string, onSubmit: (ast: string, pj: string) => void) => {
    setFullscreenDraft({ ast, propsJson, onSubmit });
  };

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
    background: 'transparent',
    border: '1px solid var(--line)',
    color: 'var(--text-sub)',
    padding: '3px 10px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    fontSize: '0.78rem',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    transition: 'background 0.12s, color 0.12s',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
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
      <div className="main-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '0.75rem 1.5rem', boxSizing: 'border-box', alignItems: 'center', background: 'var(--bg)', overflowY: 'auto' }}>
        {/* Header */}
        <header className="app-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', flexShrink: 0, width: '100%', maxWidth: '980px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', flexShrink: 0, letterSpacing: '-0.01em' }}>
            {activeFeed?.avatar
              ? <img src={activeFeed.avatar} onError={(e) => (e.currentTarget.style.display = 'none')} style={{ width: '1.2rem', height: '1.2rem', objectFit: 'cover', borderRadius: '50%', marginRight: '6px', verticalAlign: 'middle' }} />
              : null
            }
            {activeFeed?.name || 'StreamNotes'}
          </h1>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem', flexShrink: 0 }}>
            {focusedTweetId ? '/ ветка' : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {nostrPubKey && (
              <span
                onClick={() => setShowSettings(true)}
                style={{ fontSize: '0.7rem', color: 'var(--text-faint)', cursor: 'pointer', fontFamily: 'var(--font-mono)', padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}
              >
                {nostrPubKey.slice(0, 6)}…{nostrPubKey.slice(-4)}
              </span>
            )}
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              {theme === 'dark' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              )}
              {theme === 'dark' ? 'Светлая' : 'Тёмная'}
            </button>
            <button onClick={() => setShowSettings(true)} style={iconBtn}>⚙ Настройки</button>
            {focusedTweetId && (
              <button onClick={() => { setFocusedTweetId(null); setReplyingToTweetId(null); }} style={{ ...iconBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>← В ленту</button>
            )}
          </div>
        </header>
        {showSettings && (
          <SettingsModal 
            onClose={() => setShowSettings(false)} 
            onExport={handleExport}
            onImport={handleImport}
          />
        )}

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
                onExpand={(ast, pj) => {
                  setFullscreenDraft({ ast, propsJson: pj, onSubmit: insertRootNote });
                }}
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

      {fullscreenDraft && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'var(--bg)', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button onClick={() => setFullscreenDraft(null)} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--text-sub)', borderRadius: '6px', padding: '5px 15px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Назад</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <TweetEditor
                placeholder="Что происходит?"
                initialAst={fullscreenDraft.ast}
                initialPropsStr={fullscreenDraft.propsJson}
                onSubmit={(ast, pj) => { fullscreenDraft.onSubmit(ast, pj); setFullscreenDraft(null); }}
                onCancel={() => setFullscreenDraft(null)}
                autoFocus
                zenMode={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
