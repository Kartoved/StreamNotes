import React, { useState } from 'react';
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

export const KanbanView: React.FC<KanbanViewProps> = ({
  notes, parsedCache, db, feedEncrypt, onNoteClick, canWrite,
}) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  // Only root notes with a relevant status
  const rootNotes = notes.filter(n => !n.parent_id);

  const byStatus = (status: string) =>
    rootNotes.filter(n => (parsedCache.get(n.id)?.props.status || 'none') === status);

  const handleDrop = async (targetStatus: string) => {
    if (!dragId || !canWrite) return;
    const note = notes.find(n => n.id === dragId);
    if (!note) return;
    const cached = parsedCache.get(dragId);
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
      [feedEncrypt(JSON.stringify(current)), Date.now(), dragId]
    );
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      overflowX: 'auto',
      overflowY: 'hidden',
      height: 'calc(100dvh - 180px)',
      paddingBottom: '16px',
      WebkitOverflowScrolling: 'touch',
    }}>
      {COLUMNS.map(col => {
        const colNotes = byStatus(col.id);
        const isOver = overCol === col.id;
        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={() => setOverCol(null)}
            onDrop={() => handleDrop(col.id)}
            style={{
              flex: '0 0 260px',
              display: 'flex',
              flexDirection: 'column',
              background: isOver ? 'var(--bg-active)' : 'var(--bg-hover)',
              border: `1px solid ${isOver ? col.color : 'var(--line)'}`,
              borderRadius: 'var(--radius-lg)',
              transition: 'border-color 0.15s, background 0.15s',
              overflow: 'hidden',
            }}
          >
            {/* Column header */}
            <div style={{
              padding: '10px 14px 8px',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: col.color, flexShrink: 0,
              }} />
              <span style={{
                fontSize: '0.72rem', fontWeight: 700,
                color: 'var(--text-sub)', letterSpacing: '0.06em',
                textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
              }}>{col.label}</span>
              <span style={{
                marginLeft: 'auto',
                fontSize: '0.7rem', color: 'var(--text-faint)',
                fontFamily: 'var(--font-mono)',
              }}>{colNotes.length}</span>
            </div>

            {/* Cards */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              {colNotes.map(note => (
                <KanbanCard
                  key={note.id}
                  note={note}
                  cached={parsedCache.get(note.id)}
                  isDragging={dragId === note.id}
                  onDragStart={() => setDragId(note.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => onNoteClick?.(note.id)}
                  canWrite={canWrite}
                />
              ))}
              {colNotes.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '24px 8px',
                  color: 'var(--text-faint)', fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                }}>пусто</div>
              )}
            </div>
          </div>
        );
      })}
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
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  note, cached, isDragging, onDragStart, onDragEnd, onClick, canWrite,
}) => {
  const text = cached?.text ?? '';
  const props = cached?.props ?? {};
  const excerpt = text.trim().slice(0, 80) || '(пусто)';
  const d = new Date(note.created_at);
  const dateStr = `${String(d.getFullYear()).slice(2)}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

  return (
    <div
      draggable={canWrite}
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
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
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
        <span style={{
          fontSize: '0.68rem', color: 'var(--text-faint)',
          fontFamily: 'var(--font-mono)',
        }}>{dateStr}</span>

        {props.date && (
          <span style={{
            fontSize: '0.68rem', color: 'var(--text-faint)',
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-hover)', borderRadius: '3px', padding: '0 5px',
            border: '1px solid var(--line)',
          }}>📅 {props.date.slice(0, 10)}</span>
        )}

        {props.recurrence && (
          <span style={{
            fontSize: '0.68rem', color: '#6095ed',
            fontFamily: 'var(--font-mono)',
            background: 'rgba(96,149,237,0.1)', borderRadius: '3px', padding: '0 5px',
            border: '1px solid rgba(96,149,237,0.25)',
          }}>🔁 {props.recurrence}d</span>
        )}

        {note.is_pinned ? (
          <span style={{ fontSize: '0.68rem', marginLeft: 'auto' }}>📌</span>
        ) : null}
      </div>
    </div>
  );
};
