import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDB } from './db/DBContext';
import { Feed, extractTags, extractPlainText } from './components/Feed';
import { TweetEditor } from './components/TiptapEditor';
import { useNotes } from './db/hooks';
import './index.css';

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
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <button style={btnBase} onClick={prev}>‹</button>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>{MONTHS[month]} {year}</span>
        <button style={btnBase} onClick={next}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '2px' }}>
        {DAYS.map(d => <div key={d} style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>)}
      </div>

      {/* Day cells */}
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
                position: 'relative',
                transition: 'background 0.12s',
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
  const allNotes = useNotes(null); // for sidebar tags/calendar

  useEffect(() => { (window as any).db = db; }, [db]);

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

  // All tags from all notes
  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    allNotes.forEach(n => extractTags(n.content).forEach(t => s.add(t)));
    return [...s].sort();
  }, [allNotes]);

  // Days that have notes (for calendar dots)
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
    const id = 'note-' + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, focusedTweetId, 'local-user', astText, now.toString(), propsJson, now, now]
    );
  };

  const handleInlineReply = async (parentId: string, astText: string, propsJson: string) => {
    const id = 'note-' + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, parentId, 'local-user', astText, now.toString(), propsJson, now, now]
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
          `INSERT OR IGNORE INTO notes (id, parent_id, author_id, content, sort_key, properties, view_mode, created_at, updated_at, is_deleted) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [n.id, n.parent_id, n.author_id, n.content, n.sort_key, n.properties || '{}', n.view_mode || 'list', n.created_at, n.updated_at, n.is_deleted || 0]
        );
      }
      alert(`Импортировано ${notes.length} заметок`);
    } catch (err) { alert('Ошибка: ' + String(err)); }
    e.target.value = '';
  };

  const iconBtn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-muted)', padding: '2px 9px', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.75rem', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '1.1rem', background: '-webkit-linear-gradient(45deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', flexShrink: 0 }}>
          StreamNotes
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

      {/* Main layout: feed + sidebar */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* ── Left: editor + feed ── */}
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

        {/* ── Right: sidebar ── */}
        <div style={{
          width: '220px', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '16px',
          overflowY: 'auto',
        }}>
          {/* Search */}
          <div>
            <input
              type="search"
              className="search-bar"
              placeholder="🔍 Поиск..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Calendar */}
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
              >
                ✕ Сбросить дату
              </button>
            )}
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Теги</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {allTags.map(tag => (
                  <span
                    key={tag}
                    className={`tag-pill${selectedTags.has(tag) ? ' active' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
