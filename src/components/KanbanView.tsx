import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Note } from '../db/hooks';

interface KanbanViewProps {
  notes: Note[];
  parsedCache: Map<string, { props: any; text: string }>;
  db: any;
  feedEncrypt: (s: string) => string;
  onNoteClick?: (id: string) => void;
  canWrite: boolean;
}

const COLUMNS = [
  { id: 'todo',  label: 'Todo',  color: '#e06c75' },
  { id: 'doing', label: 'Doing', color: '#6095ed' },
  { id: 'done',  label: 'Done',  color: '#5c9e6e' },
] as const;

type ColId = typeof COLUMNS[number]['id'];

function useIsMobileKanban() {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const h = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

export const KanbanView: React.FC<KanbanViewProps> = ({
  notes, parsedCache, db, feedEncrypt, onNoteClick, canWrite,
}) => {
  const isMobile = useIsMobileKanban();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [activeColIdx, setActiveColIdx] = useState(0);

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Single-pass grouping by status (replaces 3× byStatus filters)
  const notesByStatus = useMemo(() => {
    const m = new Map<ColId, Note[]>([
      ['todo', []], ['doing', []], ['done', []],
    ]);
    for (const n of notes) {
      const s = (parsedCache.get(n.id)?.props.status || 'none') as ColId;
      const bucket = m.get(s);
      if (bucket) bucket.push(n);
    }
    return m;
  }, [notes, parsedCache]);

  const moveCard = async (noteId: string, targetStatus: ColId) => {
    if (!canWrite) return;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const cached = parsedCache.get(noteId);
    const current = { ...(cached?.props ?? {}) };
    if (current.status === targetStatus) return;
    current.status = targetStatus;
    if (targetStatus === 'done') {
      const today = new Date();
      current.completed_at = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    } else {
      delete current.completed_at;
    }
    await db.exec(
      `UPDATE notes SET properties = ?, updated_at = ? WHERE id = ?`,
      [feedEncrypt(JSON.stringify(current)), Date.now(), noteId]
    );

    // Replicate recurrence logic from NoteCard.saveProp — create the next
    // task instance when a recurring note is moved to DONE.
    if (targetStatus === 'done' && current.recurrence) {
      const days = parseInt(current.recurrence) || 1;
      const next = new Date();
      next.setDate(next.getDate() + days);
      const pad = (n: number) => String(n).padStart(2, '0');
      const nextDate = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
      const nextProps = { status: 'todo', type: current.type, recurrence: current.recurrence, date: nextDate };
      const now = Date.now();
      const newId = 'note-' + Math.random().toString(36).substring(2, 9);
      await db.exec(
        `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [newId, null, note.author_id, feedEncrypt(note.content), now.toString(), feedEncrypt(JSON.stringify(nextProps)), note.feed_id, now, now]
      );
    }
  };

  const handleDrop = async (targetStatus: string) => {
    if (!dragId || !canWrite) return;
    await moveCard(dragId, targetStatus as ColId);
    setDragId(null);
    setOverCol(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    if (dx < 0) setActiveColIdx(i => Math.min(i + 1, COLUMNS.length - 1));
    else        setActiveColIdx(i => Math.max(i - 1, 0));
  };

  if (isMobile) {
    const col = COLUMNS[activeColIdx];
    const colNotes = notesByStatus.get(col.id) ?? [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 180px)' }}>

        {/* Column tabs */}
        <div style={{ display: 'flex', gap: '6px', padding: '0 4px 10px', flexShrink: 0 }}>
          {COLUMNS.map((c, i) => {
            const isActive = i === activeColIdx;
            const count = (notesByStatus.get(c.id) ?? []).length;
            return (
              <button
                key={c.id}
                onClick={() => setActiveColIdx(i)}
                style={{
                  flex: 1, padding: '7px 4px',
                  background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: '8px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.color }} />
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700,
                    color: isActive ? 'var(--text)' : 'var(--text-sub)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    fontFamily: 'var(--font-mono)',
                  }}>{c.label}</span>
                </span>
                <span style={{
                  fontSize: '0.65rem', color: isActive ? 'var(--accent)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-mono)', fontWeight: 600,
                }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Active column — full width, swipeable */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-hover)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {/* Swipe hint dots */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '5px',
            padding: '8px 0 0', flexShrink: 0,
          }}>
            {COLUMNS.map((_, i) => (
              <div key={i} style={{
                width: i === activeColIdx ? '16px' : '5px',
                height: '5px', borderRadius: '3px',
                background: i === activeColIdx ? 'var(--accent)' : 'var(--line)',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>

          <VirtualizedColumn
            notes={colNotes}
            parsedCache={parsedCache}
            isMobile
            canWrite={canWrite}
            dragId={dragId}
            setDragId={setDragId}
            onCardClick={id => onNoteClick?.(id)}
            onMoveLeft={activeColIdx > 0
              ? id => moveCard(id, COLUMNS[activeColIdx - 1].id)
              : undefined}
            onMoveRight={activeColIdx < COLUMNS.length - 1
              ? id => moveCard(id, COLUMNS[activeColIdx + 1].id)
              : undefined}
          />
        </div>

        {/* Prev / Next navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', flexShrink: 0 }}>
          <button
            onClick={() => setActiveColIdx(i => Math.max(i - 1, 0))}
            disabled={activeColIdx === 0}
            style={{
              background: 'transparent', border: '1px solid var(--line)',
              borderRadius: '8px', padding: '6px 16px',
              color: activeColIdx === 0 ? 'var(--text-faint)' : 'var(--text)',
              cursor: activeColIdx === 0 ? 'default' : 'pointer',
              fontSize: '0.8rem', fontFamily: 'var(--font-body)',
              opacity: activeColIdx === 0 ? 0.35 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            ← {activeColIdx > 0 ? COLUMNS[activeColIdx - 1].label : ''}
          </button>
          <button
            onClick={() => setActiveColIdx(i => Math.min(i + 1, COLUMNS.length - 1))}
            disabled={activeColIdx === COLUMNS.length - 1}
            style={{
              background: 'transparent', border: '1px solid var(--line)',
              borderRadius: '8px', padding: '6px 16px',
              color: activeColIdx === COLUMNS.length - 1 ? 'var(--text-faint)' : 'var(--text)',
              cursor: activeColIdx === COLUMNS.length - 1 ? 'default' : 'pointer',
              fontSize: '0.8rem', fontFamily: 'var(--font-body)',
              opacity: activeColIdx === COLUMNS.length - 1 ? 0.35 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {activeColIdx < COLUMNS.length - 1 ? COLUMNS[activeColIdx + 1].label : ''} →
          </button>
        </div>
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', gap: '12px',
      overflowX: 'auto', overflowY: 'hidden',
      height: 'calc(100dvh - 180px)',
      paddingBottom: '16px',
      WebkitOverflowScrolling: 'touch',
    }}>
      {COLUMNS.map(col => {
        const colNotes = notesByStatus.get(col.id) ?? [];
        const isOver = overCol === col.id;
        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={() => setOverCol(null)}
            onDrop={() => handleDrop(col.id)}
            style={{
              flex: '1 1 0', minWidth: 0,
              display: 'flex', flexDirection: 'column',
              background: isOver ? 'var(--bg-active)' : 'var(--bg-hover)',
              border: `1px solid ${isOver ? col.color : 'var(--line)'}`,
              borderRadius: 'var(--radius-lg)',
              transition: 'border-color 0.15s, background 0.15s',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '10px 14px 8px',
              borderBottom: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: col.color, flexShrink: 0 }} />
              <span style={{
                fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-sub)',
                letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
              }}>{col.label}</span>
              <span style={{
                marginLeft: 'auto', fontSize: '0.7rem',
                color: 'var(--text-faint)', fontFamily: 'var(--font-mono)',
              }}>{colNotes.length}</span>
            </div>

            <VirtualizedColumn
              notes={colNotes}
              parsedCache={parsedCache}
              canWrite={canWrite}
              dragId={dragId}
              setDragId={setDragId}
              onDragEnd={() => { setDragId(null); setOverCol(null); }}
              onCardClick={id => onNoteClick?.(id)}
            />
          </div>
        );
      })}
    </div>
  );
};

// ── Virtualized column ─────────────────────────────────────────────────
interface VirtualizedColumnProps {
  notes: Note[];
  parsedCache: Map<string, { props: any; text: string }>;
  canWrite: boolean;
  isMobile?: boolean;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDragEnd?: () => void;
  onCardClick: (id: string) => void;
  onMoveLeft?: (id: string) => void;
  onMoveRight?: (id: string) => void;
}

const VirtualizedColumn: React.FC<VirtualizedColumnProps> = ({
  notes, parsedCache, canWrite, isMobile,
  dragId, setDragId, onDragEnd, onCardClick,
  onMoveLeft, onMoveRight,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (isMobile ? 150 : 110),
    overscan: isMobile ? 4 : 6,
  });

  if (notes.length === 0) {
    return (
      <div style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
        <div style={{
          textAlign: 'center', padding: isMobile ? '40px 8px' : '24px 8px',
          color: 'var(--text-faint)', fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
        }}>пусто</div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map(v => {
          const note = notes[v.index];
          if (!note) return null;
          return (
            <div
              key={note.id}
              data-index={v.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                transform: `translateY(${v.start}px)`,
                paddingBottom: '6px',
              }}
            >
              <KanbanCard
                note={note}
                cached={parsedCache.get(note.id)}
                isDragging={dragId === note.id}
                onDragStart={() => setDragId(note.id)}
                onDragEnd={() => { setDragId(null); onDragEnd?.(); }}
                onClick={() => onCardClick(note.id)}
                canWrite={canWrite}
                isMobile={isMobile}
                onMoveLeft={onMoveLeft ? () => onMoveLeft(note.id) : undefined}
                onMoveRight={onMoveRight ? () => onMoveRight(note.id) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Kanban card ────────────────────────────────────────────────────────
interface KanbanCardProps {
  note: Note;
  cached: { props: any; text: string } | undefined;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  canWrite: boolean;
  isMobile?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  note, cached, isDragging, onDragStart, onDragEnd, onClick, canWrite,
  isMobile, onMoveLeft, onMoveRight,
}) => {
  const text = cached?.text ?? '';
  const props = cached?.props ?? {};
  const excerpt = text.trim().slice(0, 80) || '(пусто)';
  const d = new Date(note.created_at);
  const dateStr = `${String(d.getFullYear()).slice(2)}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

  const moveBtn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--line)',
    borderRadius: '5px', padding: '3px 10px',
    color: 'var(--text-sub)', cursor: 'pointer',
    fontSize: '0.75rem', fontFamily: 'var(--font-body)',
    lineHeight: 1,
  };

  // Compute neighbour labels from current status (covers 'none' too)
  const curIdx = COLUMNS.findIndex(c => c.id === (props.status || 'todo'));
  const leftLabel = curIdx > 0 ? COLUMNS[curIdx - 1].label : '';
  const rightLabel = curIdx >= 0 && curIdx < COLUMNS.length - 1 ? COLUMNS[curIdx + 1].label : '';

  return (
    <div
      draggable={canWrite && !isMobile}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '10px 12px',
        cursor: 'pointer',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s, box-shadow 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={e => { if (!isMobile) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'; }}
      onMouseLeave={e => { if (!isMobile) e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{
        fontSize: '0.82rem', color: 'var(--text)',
        lineHeight: 1.5, marginBottom: '8px',
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {excerpt}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {dateStr}
        </span>

        {props.date && (
          <span style={{
            fontSize: '0.68rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)',
            background: 'var(--bg-hover)', borderRadius: '3px', padding: '0 5px',
            border: '1px solid var(--line)',
          }}>📅 {props.date.slice(0, 10)}</span>
        )}

        {props.recurrence && (
          <span style={{
            fontSize: '0.68rem', color: '#6095ed', fontFamily: 'var(--font-mono)',
            background: 'rgba(96,149,237,0.1)', borderRadius: '3px', padding: '0 5px',
            border: '1px solid rgba(96,149,237,0.25)',
          }}>🔁 {props.recurrence}d</span>
        )}

        {note.is_pinned ? <span style={{ fontSize: '0.68rem', marginLeft: 'auto' }}>📌</span> : null}
      </div>

      {/* Mobile: move-to-column buttons */}
      {isMobile && canWrite && (onMoveLeft || onMoveRight) && (
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '8px' }}
          onClick={e => e.stopPropagation()}
        >
          {onMoveLeft && <button onClick={onMoveLeft} style={moveBtn}>← {leftLabel}</button>}
          {onMoveRight && <button onClick={onMoveRight} style={moveBtn}>{rightLabel} →</button>}
        </div>
      )}
    </div>
  );
};
