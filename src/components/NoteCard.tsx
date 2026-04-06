import React, { useState, useCallback } from 'react';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];

// ── Deterministic color from npub ──────────────────────────────────
function npubColor(npub: string): string {
  let hash = 0;
  for (let i = 0; i < npub.length; i++) hash = ((hash << 5) - hash + npub.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

function AuthorBadge({ authorId, isLocal }: { authorId: string; isLocal: boolean }) {
  const color = npubColor(authorId);
  const label = isLocal ? 'you' : `${authorId.slice(0, 6)}…${authorId.slice(-4)}`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{
        width: '16px', height: '16px', borderRadius: '50%',
        background: color, display: 'inline-block', flexShrink: 0,
      }} />
      <span style={{
        fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.02em',
        color: isLocal ? 'var(--text-sub)' : color,
        fontFamily: isLocal ? 'var(--font-body)' : 'var(--font-mono)',
      }}>
        {label}
      </span>
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
      <input
        type="date"
        autoFocus
        defaultValue={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onClick={e => e.stopPropagation()}
        style={{
          fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
          background: 'var(--bg)', border: '1px solid var(--line-strong)',
          borderRadius: '4px', padding: '1px 6px', color: 'var(--text)',
          outline: 'none', cursor: 'pointer',
        }}
      />
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
        transition: 'all 0.1s', outline: 'none',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-active)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
    >{value}</button>
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
}

export const NoteCard = ({
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
}: NoteCardProps) => {
  let props: any = {};
  try { 
    const raw = decrypt(note.properties) || '{}';
    props = JSON.parse(raw); 
  } catch { /* */ }

  const [status, setStatus]     = useState<string>(props.status || 'none');
  const [type, setType]         = useState<string>(props.type || 'sheaf');
  const [targetDate, setDate]   = useState<string>(props.date || '');

  // Synchronize state with props when data changes
  React.useEffect(() => {
    try {
      const raw = decrypt(note.properties) || '{}';
      const p = JSON.parse(raw);
      setStatus(p.status || 'none');
      setType(p.type || 'sheaf');
      setDate(p.date || '');
    } catch { /* */ }
  }, [note.properties, decrypt]);

  // Save a single prop change to DB immediately
  const saveProp = useCallback(async (key: string, val: string) => {
    const current = { ...props, status, type, date: targetDate, [key]: val };
    await db.exec(
      `UPDATE notes SET properties = ?, updated_at = ? WHERE id = ?`,
      [encrypt(JSON.stringify(current)), Date.now(), note.id]
    );
  }, [db, encrypt, note.id, props, status, type, targetDate]);

  const handleStatus = (v: string) => { setStatus(v); saveProp('status', v); };
  const handleDate   = (v: string) => { setDate(v);   saveProp('date', v); };

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
      draggable={editingNoteId !== note.id}
      onDragStart={(e) => editingNoteId !== note.id && onDragStart(e, note.id)}
      onDragOver={(e) => onDragOver(e, note.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, note.id)}
      onDragEnd={onDragEnd}
      className="note-card"
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%',
        transform: `translateY(${virtualItem.start}px)`,
        padding: '5px 6px',
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

      {/* ── Card panel ── */}
      <div style={{
        marginLeft: `${indent}px`,
        background: finalBg !== 'transparent' ? finalBg : 'var(--card-bg)',
        border: (isDragOverSibling || isDragOverChild)
          ? '1px solid var(--accent)'
          : '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 20px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.12s, background 0.12s',
      }}>

        {/* DnD overlays */}
        {draggedId && draggedId !== note.id && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none', borderRadius: 'inherit', overflow: 'hidden', zIndex: 1, border: (isDragOverSibling || isDragOverChild) ? '1px solid var(--line-strong)' : 'none' }}>
            <div style={{ flex: 1, background: isDragOverSibling ? 'var(--bg-hover)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isDragOverSibling && <span style={{ fontSize: '0.6rem', color: 'var(--text-sub)', fontWeight: 600 }}>sibling</span>}
            </div>
            <div style={{ flex: 1, background: isDragOverChild ? 'var(--bg-hover)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isDragOverChild && <span style={{ fontSize: '0.6rem', color: 'var(--text-sub)', fontWeight: 600 }}>child</span>}
            </div>
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
                {note.author_id === localNpub || note.author_id === 'local-user' ? 'you' : note.author_id.slice(0, 8)}
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
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
                  {targetDate && (
                    <DateChip value={targetDate} onChange={handleDate} />
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

    </div>
  );
};
