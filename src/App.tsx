import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDB } from './db/DBContext';
import { Feed, extractTags, extractPlainText } from './components/Feed';
import { TweetEditor } from './components/TiptapEditor';
import { useNotes, useFeeds } from './db/hooks';
import type { Feed as FeedData } from './db/hooks';
import './index.css';

// ─── Helpers ──────────────────────────────────────────────────────────
const FEED_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
const randomColor = () => FEED_COLORS[Math.floor(Math.random() * FEED_COLORS.length)];
const uid = () => Math.random().toString(36).substring(2, 9);

async function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const s = Math.max(64 / img.width, 64 / img.height);
      const w = img.width * s; const h = img.height * s;
      ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.src = url;
  });
}

// ─── Feed Icon ────────────────────────────────────────────────────────
const FeedIcon = ({ feed, active }: { feed: FeedData; active: boolean }) => {
  const initials = feed.name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: '44px', height: '44px', borderRadius: active ? '14px' : '50%',
      background: feed.avatar ? 'transparent' : feed.color,
      border: active ? `2px solid ${feed.color}` : '2px solid transparent',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', flexShrink: 0,
      boxShadow: active ? `0 0 0 2px ${feed.color}44` : 'none',
      transition: 'border-radius 0.2s, box-shadow 0.2s, border 0.2s',
    }}>
      {feed.avatar
        ? <img src={feed.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem', userSelect: 'none' }}>{initials}</span>
      }
    </div>
  );
};

// ─── Feeds Sidebar ────────────────────────────────────────────────────
const FeedsSidebar = ({
  feeds,
  activeFeedId,
  onSelect,
  onCreateFeed,
  onUpdateFeed,
  onDeleteFeed,
}: {
  feeds: FeedData[];
  activeFeedId: string | null;
  onSelect: (id: string) => void;
  onCreateFeed: (name: string, color: string, avatar: string | null) => void;
  onUpdateFeed: (id: string, name: string, color: string, avatar: string | null) => void;
  onDeleteFeed: (id: string) => void;
}) => {
  const [modal, setModal] = useState<'create' | FeedData | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalColor, setModalColor] = useState('#3b82f6');
  const [modalAvatar, setModalAvatar] = useState<string | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setModalName(''); setModalColor(randomColor()); setModalAvatar(null); setModal('create');
  };
  const openEdit = (feed: FeedData) => {
    setModalName(feed.name); setModalColor(feed.color); setModalAvatar(feed.avatar); setModal(feed);
  };

  const handleSave = () => {
    if (!modalName.trim()) return;
    if (modal === 'create') {
      onCreateFeed(modalName.trim(), modalColor, modalAvatar);
    } else if (modal && typeof modal === 'object') {
      onUpdateFeed(modal.id, modalName.trim(), modalColor, modalAvatar);
    }
    setModal(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeAvatar(file);
    setModalAvatar(dataUrl);
    e.target.value = '';
  };

  const swatch = (color: string) => (
    <div
      key={color}
      onClick={() => { setModalColor(color); setModalAvatar(null); }}
      style={{
        width: '24px', height: '24px', borderRadius: '50%', background: color, cursor: 'pointer',
        border: color === modalColor && !modalAvatar ? '2px solid white' : '2px solid transparent',
        transition: '0.1s',
      }}
    />
  );

  return (
    <>
      <div style={{
        width: '64px', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '12px', paddingBottom: '12px', gap: '8px',
        borderRight: '1px solid var(--border)',
        background: 'var(--card-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ fontSize: '1.4rem', marginBottom: '4px', userSelect: 'none' }}>📝</div>
        <div style={{ width: '32px', height: '1px', background: 'var(--border)', marginBottom: '4px' }} />

        {feeds.map(feed => (
          <div
            key={feed.id}
            className="feed-item"
            onClick={() => activeFeedId === feed.id ? openEdit(feed) : onSelect(feed.id)}
          >
            <FeedIcon feed={feed} active={feed.id === activeFeedId} />
            <div className="feed-tooltip">{feed.name}</div>
          </div>
        ))}

        {/* Add feed */}
        <div className="feed-item" style={{ marginTop: '4px' }}>
          <div
            onClick={openCreate}
            style={{
              width: '44px', height: '44px', borderRadius: '50%',
              border: '2px dashed var(--border)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.4rem',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          >+</div>
          <div className="feed-tooltip">Новая лента</div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '24px', width: '300px',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              display: 'flex', flexDirection: 'column', gap: '16px',
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {modal === 'create' ? 'Новая лента' : 'Редактировать ленту'}
            </div>

            {/* Preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                onClick={() => avatarRef.current?.click()}
                style={{
                  width: '52px', height: '52px', borderRadius: '16px',
                  background: modalAvatar ? 'transparent' : modalColor,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, border: '2px solid var(--border)',
                  position: 'relative',
                }}
                title="Загрузить аватар"
              >
                {modalAvatar
                  ? <img src={modalAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: 'white', fontWeight: 700, fontSize: '1.2rem' }}>{(modalName || '?').slice(0, 2).toUpperCase()}</span>
                }
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                >
                  <span style={{ fontSize: '1.2rem' }}>📷</span>
                </div>
              </div>
              <input
                type="text"
                value={modalName}
                onChange={e => setModalName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder="Название ленты"
                autoFocus
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  color: 'var(--text-main)', fontSize: '0.95rem',
                  padding: '8px 12px', outline: 'none',
                }}
              />
            </div>

            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

            {/* Color swatches */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {FEED_COLORS.map(swatch)}
              {modalAvatar && (
                <div onClick={() => setModalAvatar(null)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }} title="Убрать аватар">✕</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              {modal !== 'create' && typeof modal === 'object' && (
                <button
                  onClick={() => { onDeleteFeed(modal.id); setModal(null); }}
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', marginRight: 'auto' }}
                >Удалить</button>
              )}
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>Отмена</button>
              <button onClick={handleSave} disabled={!modalName.trim()} style={{ background: 'var(--accent)', border: 'none', color: 'white', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', opacity: modalName.trim() ? 1 : 0.5 }}>
                {modal === 'create' ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Mini Calendar ────────────────────────────────────────────────────
const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

const MiniCalendar = ({
  activeDays,
  selectedDate,
  onSelectDate,
}: {
  activeDays: Set<string>;
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
}) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const btnBase: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: '0.9rem', padding: '2px 6px',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <button style={btnBase} onClick={prev}>‹</button>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>{MONTHS[month]} {year}</span>
        <button style={btnBase} onClick={next}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '2px' }}>
        {DAYS.map(d => <div key={d} style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = iso === todayStr;
          const isSelected = iso === selectedDate;
          const hasNotes = activeDays.has(iso);
          return (
            <div
              key={iso}
              onClick={() => onSelectDate(isSelected ? null : iso)}
              style={{
                textAlign: 'center', padding: '4px 2px',
                borderRadius: '6px', cursor: hasNotes ? 'pointer' : 'default',
                fontSize: '0.78rem',
                background: isSelected ? 'var(--accent)' : isToday ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isSelected ? 'white' : isToday ? 'var(--accent)' : hasNotes ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: isToday || isSelected ? 700 : hasNotes ? 500 : 400,
                opacity: hasNotes || isToday ? 1 : 0.4,
                position: 'relative', transition: 'background 0.12s',
              }}
            >
              {day}
              {hasNotes && !isSelected && (
                <div style={{ position: 'absolute', bottom: '1px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────
function App() {
  const db = useDB();
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (window as any).db = db; }, [db]);

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
          [id, 'Главная', '#3b82f6', Date.now()]
        );
      }
    })();
  }, [db]);

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
          [id, 'Главная', '#3b82f6', now]
        );
        setActiveFeedId(id);
      }
    })();
  }, [db]);

  const handleCreateFeed = useCallback(async (name: string, color: string, avatar: string | null) => {
    const id = 'feed-' + uid();
    await db.exec(
      `INSERT INTO feeds (id, name, color, avatar, created_at) VALUES (?,?,?,?,?)`,
      [id, name, color, avatar, Date.now()]
    );
    setActiveFeedId(id);
  }, [db]);

  const handleUpdateFeed = useCallback(async (id: string, name: string, color: string, avatar: string | null) => {
    await db.exec(`UPDATE feeds SET name = ?, color = ?, avatar = ? WHERE id = ?`, [name, color, avatar, id]);
  }, [db]);

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
      [id, focusedTweetId, 'local-user', astText, now.toString(), propsJson, activeFeedId, now, now]
    );
  };

  const handleInlineReply = async (parentId: string, astText: string, propsJson: string) => {
    if (!activeFeedId) return;
    const id = 'note-' + uid();
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, parentId, 'local-user', astText, now.toString(), propsJson, activeFeedId, now, now]
    );
    setReplyingToTweetId(null);
  };

  const handleEditSubmit = async (noteId: string, astText: string, propsJson: string) => {
    await db.exec(
      `UPDATE notes SET content = ?, properties = ?, updated_at = ? WHERE id = ?`,
      [astText, propsJson, Date.now(), noteId]
    );
    setEditingTweet(null);
  };

  // ── Export / Import ────────────────────────────────────────────────
  const handleExport = async () => {
    const rows = await db.execO(`SELECT * FROM notes WHERE is_deleted = 0`);
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
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
      const notes: any[] = JSON.parse(await file.text());
      for (const n of notes) {
        await db.exec(
          `INSERT OR IGNORE INTO notes (id, parent_id, author_id, content, sort_key, properties, view_mode, feed_id, created_at, updated_at, is_deleted) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [n.id, n.parent_id, n.author_id, n.content, n.sort_key, n.properties || '{}', n.view_mode || 'list', n.feed_id || activeFeedId, n.created_at, n.updated_at, n.is_deleted || 0]
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
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '0.75rem 1rem', boxSizing: 'border-box' }}>
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.75rem', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', background: '-webkit-linear-gradient(45deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', flexShrink: 0 }}>
            {activeFeed?.name || 'StreamNotes'}
          </h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
            {focusedTweetId ? 'Ветка обсуждения' : 'Главная лента'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={iconBtn}>{theme === 'dark' ? '☀' : '🌙'}</button>
            <button onClick={handleExport} style={iconBtn}>↑ Export</button>
            <label style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              ↓ Import<input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            </label>
            {focusedTweetId && (
              <button onClick={() => { setFocusedTweetId(null); setReplyingToTweetId(null); }} style={{ ...iconBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>← В корень</button>
            )}
          </div>
        </header>

        {/* Main layout: feed + right sidebar */}
        <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
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

          {/* Right sidebar */}
          <div style={{
            width: '220px', flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: '16px',
            overflowY: 'auto',
          }}>
            <div>
              <input
                type="search"
                className="search-bar"
                placeholder="🔍 Поиск..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px' }}>
              <MiniCalendar
                activeDays={activeDays}
                selectedDate={selectedDate}
                onSelectDate={(d) => { setSelectedDate(d); }}
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  style={{ marginTop: '6px', width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '3px', fontSize: '0.72rem', cursor: 'pointer' }}
                >✕ Сбросить дату</button>
              )}
            </div>

            {allTags.length > 0 && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Теги</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {allTags.map(tag => (
                    <span
                      key={tag}
                      className={`tag-pill${selectedTags.has(tag) ? ' active' : ''}`}
                      onClick={() => toggleTag(tag)}
                    >{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
