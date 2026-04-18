import React, { useState, useCallback, useRef } from 'react';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';
import { useCrypto } from '../crypto/CryptoContext';

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];

// ── Deterministic color from npub ──────────────────────────────────
function npubColor(npub: string): string {
  let hash = 0;
  for (let i = 0; i < npub.length; i++) hash = ((hash << 5) - hash + npub.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

function AuthorBadge({ authorId, isLocal }: { authorId: string; isLocal: boolean }) {
  const { nickname } = useCrypto();
  const color = npubColor(authorId);
  const label = isLocal ? nickname : `${authorId.slice(0, 6)}…${authorId.slice(-4)}`;
  return (
    <span style={{
      fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.02em',
      color: 'var(--text-sub)',
      fontFamily: 'var(--font-mono)',
    }}>
      {label}
    </span>
  );
}

// ── Status cycle colors ─────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  none:     'var(--text-faint)',
  todo:     '#e06c75',
  doing:    '#6095ed',
  done:     '#5c9e6e',
  archived: 'var(--text-faint)',
};

// ── Inline editable prop chip ───────────────────────────────────────
export function PropChip({
  value, options, onChange, mono,
}: {
  value: string; options: string[]; onChange: (v: string) => void; mono?: boolean;
}) {
  const isStatus = options === STATUSES;
  const color = isStatus ? (STATUS_COLOR[value] || 'var(--text-sub)') : 'var(--text-sub)';

  return (
    <div style={{ display: 'inline-block', position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          background: 'var(--bg-hover)',
          color,
          border: '1px solid var(--line)',
          borderRadius: '4px',
          padding: '1px 8px',
          fontSize: '0.7rem',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
          cursor: 'pointer',
          userSelect: 'none',
          lineHeight: 1.6,
          transition: 'all 0.1s',
          outline: 'none',
          fontWeight: 600,
          textAlign: 'center',
          minWidth: '60px'
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-active)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
      >
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: 'var(--bg)', color: (isStatus && STATUS_COLOR[opt]) ? STATUS_COLOR[opt] : 'var(--text)' }}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Date chip ───────────────────────────────────────────────────────
export function DateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={e => e.stopPropagation()}>
        <input
          type="date"
          autoFocus
          defaultValue={value}
          onChange={e => { if (e.target.value) onChange(e.target.value); }}
          onBlur={e => {
            // don't close if clicking the Сбросить button
            if ((e.relatedTarget as HTMLElement)?.dataset?.clearDate) return;
            setEditing(false);
          }}
          style={{
            fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
            background: 'var(--bg)', border: '1px solid var(--line-strong)',
            borderRadius: '4px', padding: '1px 6px', color: 'var(--text)',
            outline: 'none', cursor: 'pointer',
          }}
        />
        <button
          type="button"
          data-clear-date="1"
          onMouseDown={e => { e.preventDefault(); onChange(''); setEditing(false); }}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-faint)',
            fontSize: '0.7rem', cursor: 'pointer', padding: '0 2px',
            fontFamily: 'var(--font-body)',
          }}
        >Сбросить</button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      style={{
        background: 'var(--bg-hover)', color: 'var(--text-faint)',
        borderRadius: '4px', padding: '1px 7px',
        fontSize: '0.7rem', border: '1px solid var(--line)',
        fontFamily: 'var(--font-mono)', cursor: 'pointer', userSelect: 'none',
        transition: 'background 0.1s', outline: 'none',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-active)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
    >{value}</button>
  );
}

// ── Completion date chip (read-only) ────────────────────────────────
export function CompletionDateChip({ value }: { value: string }) {
  return (
    <span
      style={{
        background: 'var(--bg-hover)', color: 'var(--text-faint)',
        borderRadius: '4px', padding: '1px 7px',
        fontSize: '0.7rem', border: '1px solid var(--line)',
        fontFamily: 'var(--font-mono)', userSelect: 'none',
        display: 'inline-block',
      }}
    >
      ✓ {value}
    </span>
  );
}

// ── Recurrence chip ──────────────────────────────────────────────────
export function RecurrenceChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const days = parseInt(value) || 0;

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        autoFocus
        defaultValue={days || ''}
        placeholder="дн."
        onBlur={(e) => {
          const n = parseInt(e.target.value) || 0;
          onChange(n > 0 ? `${n}` : '');
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); }
        }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '52px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
          background: 'var(--bg)', border: '1px solid var(--line-strong)',
          borderRadius: '4px', padding: '1px 6px', color: 'var(--text)',
          outline: 'none',
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{
        background: days ? 'rgba(96, 149, 237, 0.12)' : 'var(--bg-hover)',
        color: days ? '#6095ed' : 'var(--text-faint)',
        borderRadius: '4px', padding: '1px 7px',
        fontSize: '0.7rem', border: '1px solid ' + (days ? 'rgba(96, 149, 237, 0.3)' : 'var(--line)'),
        fontFamily: 'var(--font-mono)', cursor: 'pointer', userSelect: 'none',
        transition: 'all 0.1s', outline: 'none',
      }}
      title="Повторяемость (дни)"
    >🔁 {days ? `${days}d` : 'off'}</button>
  );
}

interface NoteCardProps {
  note: any;
  virtualItem: any;
  virtualizer: any;
  indent: number;
  isReplying: boolean;
  editingNoteId: string | null;
  draggedId: string | null;
  dragOverInfo: { id: string; zone: 'sibling' | 'child' } | null;

  onNoteClick?: (id: string) => void;
  openContextMenu: (e: React.MouseEvent, id: string) => void;
  openContextMenuAt?: (x: number, y: number, id: string) => void;
  onStartReply?: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;

  onCancelEdit?: () => void;
  onSubmitEdit?: (id: string, ast: string, propsJson: string) => void;
  onCancelReply?: () => void;
  onSubmitReply?: (id: string, ast: string, propsJson: string) => void;
  onExpandNote?: (id: string) => void;

  setDragOverInfo: (info: { id: string; zone: 'sibling' | 'child' } | null) => void;
  encrypt: (s: string) => string;
  decrypt: (s: string) => string;
  db: any;
  isSharedFeed?: boolean;
  localNpub?: string;
  onTouchDragStart?: (id: string, touch: { clientX: number; clientY: number }) => void;
}

export const NoteCard = React.memo(function NoteCard({
  note,
  virtualItem,
  virtualizer,
  indent,
  isReplying,
  editingNoteId,
  draggedId,
  dragOverInfo,
  onNoteClick,
  openContextMenu,
  openContextMenuAt,
  onStartReply,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onCancelEdit,
  onSubmitEdit,
  onCancelReply,
  onSubmitReply,
  onExpandNote,
  setDragOverInfo,
  encrypt,
  decrypt,
  db,
  isSharedFeed = false,
  localNpub = '',
  onTouchDragStart,
}: NoteCardProps) {
  const { nickname } = useCrypto();
  let props: any = {};
  try { 
    const raw = decrypt(note.properties) || '{}';
    props = JSON.parse(raw); 
  } catch { /* */ }

  const [status, setStatus]     = useState<string>(props.status || 'none');
  const [type, setType]         = useState<string>(props.type || 'sheaf');
  const [targetDate, setDate]   = useState<string>(props.date || '');
  const [completedAt, setCompletedAt] = useState<string>(props.completed_at || '');
  const [recurrence, setRecurrence] = useState<string>(props.recurrence || '');

  // Synchronize state with props when data changes
  React.useEffect(() => {
    try {
      const raw = decrypt(note.properties) || '{}';
      const p = JSON.parse(raw);
      setStatus(p.status || 'none');
      setType(p.type || 'sheaf');
      setDate(p.date || '');
      setCompletedAt(p.completed_at || '');
      setRecurrence(p.recurrence || '');
    } catch { /* */ }
  }, [note.properties, decrypt]);

  // Save a single prop change to DB immediately
  const saveProp = useCallback(async (key: string, val: string) => {
    const current = { ...props, status, type, date: targetDate, recurrence, [key]: val };
    // Track when a note is marked as done
    if (key === 'status' && val === 'done') {
      const today = new Date();
      current.completed_at = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    } else if (key === 'status' && val !== 'done') {
      delete current.completed_at;
    }
    await db.exec(
      `UPDATE notes SET properties = ?, updated_at = ? WHERE id = ?`,
      [encrypt(JSON.stringify(current)), Date.now(), note.id]
    );

    // Recurring task: create next instance when marked done
    const rec = current.recurrence;
    if (key === 'status' && val === 'done' && rec) {
      const days = parseInt(rec) || 1;
      const next = new Date();
      next.setDate(next.getDate() + days);
      const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      const nextProps = { status: 'todo', type: current.type, recurrence: rec, date: nextDate };
      const now = Date.now();
      const newId = 'note-' + Math.random().toString(36).substring(2, 9);
      await db.exec(
        `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [newId, null, note.author_id, encrypt(note.content), now.toString(), encrypt(JSON.stringify(nextProps)), note.feed_id, now, now]
      );
    }
  }, [db, encrypt, note, props, status, type, targetDate, recurrence]);

  const handleStatus     = (v: string) => { setStatus(v); saveProp('status', v); };
  const handleDate       = (v: string) => { setDate(v);   saveProp('date', v); };
  const handleRecurrence = (v: string) => { setRecurrence(v); saveProp('recurrence', v); };

  // ── Touch gestures: swipe-to-reply + long-press context menu ───────
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const isSwiping = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup long-press timer if component unmounts mid-touch
  React.useEffect(() => {
    return () => clearTimeout(longPressTimer.current);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
    longPressTimer.current = setTimeout(() => {
      openContextMenuAt?.(e.touches[0].clientX, e.touches[0].clientY, note.id);
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      clearTimeout(longPressTimer.current);
    }
    if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
      isSwiping.current = true;
      e.stopPropagation();
      setSwipeOffset(Math.max(-72, dx));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    clearTimeout(longPressTimer.current);
    if (isSwiping.current) {
      e.stopPropagation(); // prevent App's tab-swipe handler from firing
      if (swipeOffset < -48) onStartReply?.(note.id);
    }
    isSwiping.current = false;
    setSwipeOffset(0);
  };

  const isDragOverChild   = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'child';
  const isDragOverSibling = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'sibling';

  let baseBg = 'transparent';
  if (status === 'done')     baseBg = 'rgba(34, 197, 94, 0.06)';
  else if (status === 'todo')    baseBg = 'rgba(239, 68, 68, 0.06)';
  else if (status === 'doing')   baseBg = 'rgba(96, 149, 237, 0.09)';
  else if (status === 'archived') baseBg = 'var(--bg-hover)';

  let finalBg = isReplying ? 'var(--accent-bg)' : baseBg;

  // Show prop row only if there's something meaningful
  // Show prop row only if there's something meaningful
  const showProps = (status && status !== 'none') || !!targetDate;

  return (
    <div
      key={virtualItem.key}
      data-index={virtualItem.index}
      data-note-id={note.id}
      ref={virtualizer.measureElement}
      onDragOver={(e) => onDragOver(e, note.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, note.id)}
      onDragEnd={onDragEnd}
      className="note-card"
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%',
        transform: `translateY(${virtualItem.start}px)`,
        padding: '2px 6px',
        opacity: draggedId === note.id ? 0.3 : 1,
      }}
    >
      {/* Vertical connector line for nested notes */}
      {note.depth > 0 && (
        <div style={{
          position: 'absolute',
          left: `calc(6px + ${indent - 10}px)`,
          top: 0, bottom: 0,
          width: '1px', background: 'var(--line)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── Card panel with swipe wrapper ── */}
      <div style={{ marginLeft: `${indent}px`, position: 'relative' }}>
        {/* Swipe-to-reply hint (revealed behind card on left swipe) */}
        <div className={`swipe-reply-hint${swipeOffset < -20 ? ' visible' : ''}`}>
          ↩ Ответить
        </div>

      <div
        className={`note-card-swipeable note-card-inner${isSwiping.current ? ' swiping' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { clearTimeout(longPressTimer.current); isSwiping.current = false; setSwipeOffset(0); }}
        style={{
          background: finalBg !== 'transparent' ? finalBg : 'var(--card-bg)',
          border: (isDragOverSibling || isDragOverChild)
            ? '1px solid var(--accent)'
            : '1px solid rgba(0,0,0,0.06)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 20px',
          position: 'relative',
          overflow: 'hidden',
          transition: swipeOffset !== 0 ? 'none' : 'border-color 0.12s, background 0.12s, transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
          transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : 'none',
        }}>

        {/* Desktop drag handle (shown on card hover, hidden on mobile) */}
        {editingNoteId !== note.id && (
          <div
            className="desktop-drag-handle"
            draggable
            onDragStart={(e) => onDragStart(e, note.id)}
            style={{
              opacity: draggedId === note.id ? 1 : undefined,
              color: draggedId === note.id ? 'var(--accent)' : undefined,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/>
              <circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/>
              <circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/>
            </svg>
          </div>
        )}

        {/* Mobile drag handle */}
        {onTouchDragStart && editingNoteId !== note.id && (
          <div
            className="mobile-drag-handle"
            style={{
              opacity: draggedId === note.id ? 1 : undefined,
              color: draggedId === note.id ? 'var(--accent)' : undefined,
              transform: `translateY(-50%)${draggedId === note.id ? ' scale(1.15)' : ''}`,
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              onTouchDragStart(note.id, e.touches[0]);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/>
              <circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/>
              <circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/>
            </svg>
          </div>
        )}

        {/* DnD indicators */}
        {draggedId && draggedId !== note.id && (isDragOverSibling || isDragOverChild) && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
            borderRadius: 'inherit',
            border: isDragOverChild ? '2px solid var(--accent)' : 'none',
            background: isDragOverChild ? 'rgba(55, 53, 47, 0.03)' : 'transparent'
          }}>
            {isDragOverSibling && (
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'var(--accent)', borderRadius: '4px 0 0 4px' }} />
            )}
          </div>
        )}

        {/* ── Card body ── */}
        <div style={{ position: 'relative', zIndex: 2 }} onContextMenu={(e) => openContextMenu(e, note.id)}>

          {/* TOP ROW: author + time */}
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px', cursor: 'pointer', userSelect: 'none' }}
            onClick={(e) => { e.stopPropagation(); onNoteClick?.(note.id); }}
          >
            {isSharedFeed ? (
              <AuthorBadge authorId={note.author_id} isLocal={note.author_id === localNpub} />
            ) : (
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.02em' }}>
                {note.author_id === localNpub || note.author_id === 'local-user' ? nickname : note.author_id.slice(0, 8)}
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {(() => {
                const d = new Date(note.created_at);
                const yy = String(d.getFullYear()).slice(2);
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                return `${yy}/${mm}/${dd} ${hh}:${min}`;
              })()}
            </span>
            {!!note.is_pinned && (
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-faint)' }} title="Закреплено">📌</span>
            )}
          </div>

          {/* DIVIDER */}
          <div style={{ height: '1px', background: 'var(--line)', marginBottom: '10px' }} />

          {/* CONTENT */}
          {editingNoteId === note.id ? (
            <div onClick={(e: any) => e.stopPropagation()}>
              <TweetEditor
                initialAst={note.content} initialPropsStr={note.properties}
                placeholder="Редактировать..." buttonText="Сохранить"
                onCancel={() => onCancelEdit && onCancelEdit()}
                onSubmit={(ast, propsJson) => { if (onSubmitEdit) onSubmitEdit(note.id, ast, propsJson); }}
                onExpand={() => onExpandNote?.(note.id)}
                autoFocus
              />
            </div>
          ) : (
            <>
              <div className="note-content">
                <TiptapRender
                  astString={note.content}
                  onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [encrypt(newAst), note.id])}
                />
              </div>

              {/* ── Inline editable props ── */}
              {showProps && (
                <div
                  style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  onDragStart={e => e.stopPropagation()}
                >
                  {status !== 'none' && (
                    <PropChip value={status} options={STATUSES} onChange={handleStatus} />
                  )}
                  {status !== 'none' && !!recurrence && (
                    <RecurrenceChip value={recurrence} onChange={handleRecurrence} />
                  )}
                  {targetDate && (
                    <DateChip value={targetDate} onChange={handleDate} />
                  )}
                  {status === 'done' && completedAt && (
                    <CompletionDateChip value={completedAt} />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Reply form */}
        {isReplying && (
          <div style={{ marginTop: '0.75rem' }}>
            <TweetEditor
              placeholder="Напиши ответ..." buttonText="Отправить"
              onCancel={() => onCancelReply && onCancelReply()}
              onSubmit={(ast, propsJson) => { if (onSubmitReply) onSubmitReply(note.id, ast, propsJson); }}
              onExpand={() => onExpandNote?.(note.id)}
              autoFocus
            />
          </div>
        )}
      </div>
      </div>{/* end swipe wrapper */}

    </div>
  );
}, (prev, next) => {
  // Custom comparator: skip re-render if key data hasn't changed.
  // Function props (callbacks) are intentionally excluded — they should
  // be stabilized with useCallback in Feed.tsx.
  return (
    prev.note.id === next.note.id &&
    prev.note.updated_at === next.note.updated_at &&
    prev.note.properties === next.note.properties &&
    prev.note.content === next.note.content &&
    prev.indent === next.indent &&
    prev.isReplying === next.isReplying &&
    prev.editingNoteId === next.editingNoteId &&
    prev.draggedId === next.draggedId &&
    prev.dragOverInfo === next.dragOverInfo &&
    prev.virtualItem.index === next.virtualItem.index &&
    prev.virtualItem.start === next.virtualItem.start
  );
});
