import React from 'react';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';
import { BacklinksSection } from './BacklinksSection';

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
  
  setDragOverInfo: (info: { id: string; zone: 'sibling' | 'child' } | null) => void;
  encrypt: (s: string) => string;
  db: any;
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
  setDragOverInfo,
  encrypt,
  db,
}: NoteCardProps) => {
  let props: any = {};
  try { props = JSON.parse(note.properties || '{}'); } catch { /* */ }

  const status = props.status || 'none';
  const type = props.type || 'tweet';
  const targetDate = props.date || '';

  const isDragOverChild = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'child';
  const isDragOverSibling = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'sibling';

  let baseBg = 'transparent';
  if (status === 'done') baseBg = 'rgba(34, 197, 94, 0.06)';
  else if (status === 'todo') baseBg = 'rgba(239, 68, 68, 0.06)';
  else if (status === 'doing') baseBg = 'rgba(232, 160, 69, 0.08)';
  else if (status === 'archived') baseBg = 'var(--bg-hover)';

  let finalBg = isReplying ? 'var(--accent-bg)' : baseBg;
  if (isDragOverChild) finalBg = 'rgba(232, 160, 69, 0.1)';

  return (
    <div
      key={virtualItem.key}
      data-index={virtualItem.index}
      data-note-id={note.id}
      ref={virtualizer.measureElement}
      draggable
      onDragStart={(e) => onDragStart(e, note.id)}
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
      {/* Vertical connector line for nested notes — sits outside the card */}
      {note.depth > 0 && (
        <div style={{
          position: 'absolute',
          left: `calc(6px + ${indent - 10}px)`,
          top: 0, bottom: 0,
          width: '1px', background: 'var(--line)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── Card panel ────────────────────────────────────── */}
      <div style={{
        marginLeft: `${indent}px`,
        background: finalBg !== 'transparent' ? finalBg : 'var(--card-bg)',
        border: isDragOverSibling
          ? '1px solid var(--accent)'
          : isDragOverChild
            ? '1px solid var(--accent)'
            : '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 20px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.12s, background 0.12s',
      }}>

        {/* DnD zone overlay */}
        {draggedId && draggedId !== note.id && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none', borderRadius: 'inherit', overflow: 'hidden', zIndex: 1 }}>
            <div style={{ flex: 1, background: isDragOverSibling ? 'rgba(167,139,250,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isDragOverSibling && <span style={{ fontSize: '0.6rem', color: '#a78bfa' }}>сиблинг</span>}
            </div>
            <div style={{ flex: 1, background: isDragOverChild ? 'rgba(96,165,250,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isDragOverChild && <span style={{ fontSize: '0.6rem', color: '#60a5fa' }}>дочерний</span>}
            </div>
          </div>
        )}

        {/* ── Card body: left sidebar + right content ─────── */}
        <div
          style={{ display: 'flex', gap: '16px', position: 'relative', zIndex: 2 }}
          onContextMenu={(e) => openContextMenu(e, note.id)}
        >
          {/* LEFT: avatar + name + time (clickable → navigate) */}
          <div
            onClick={(e) => { e.stopPropagation(); onNoteClick?.(note.id); }}
            style={{
              width: 44, flexShrink: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '3px', cursor: 'pointer', paddingTop: '2px', userSelect: 'none',
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--line-strong)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.58rem', fontWeight: 500, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.author_id}
            </span>
            <span style={{ fontSize: '0.56rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {new Date(note.created_at).toLocaleTimeString().slice(0, 5)}
            </span>
          </div>

          {/* RIGHT: content + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Content */}
            {editingNoteId === note.id ? (
              <div onClick={(e: any) => e.stopPropagation()}>
                <TweetEditor
                  initialAst={note.content} initialPropsStr={note.properties}
                  placeholder="Редактировать..." buttonText="Сохранить"
                  onCancel={() => onCancelEdit && onCancelEdit()}
                  onSubmit={(ast, propsJson) => { if (onSubmitEdit) onSubmitEdit(note.id, ast, propsJson); }}
                  autoFocus
                />
              </div>
            ) : (
              <>
                <div className="note-content" style={{ fontSize: '14px', lineHeight: 1.45 }}>
                  <TiptapRender
                    astString={note.content}
                    onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [encrypt(newAst), note.id])}
                  />
                  <BacklinksSection noteId={note.id} onNoteClick={onNoteClick} />
                </div>
                {(type !== 'tweet' || (status && status !== 'none') || targetDate) && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {type !== 'tweet' && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-sub)', borderRadius: '4px', padding: '1px 7px', fontSize: '0.7rem', border: '1px solid var(--line)' }}>{type}</span>}
                    {status !== 'none' && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-sub)', borderRadius: '4px', padding: '1px 7px', fontSize: '0.7rem', border: '1px solid var(--line)' }}>{status}</span>}
                    {targetDate && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)', borderRadius: '4px', padding: '1px 7px', fontSize: '0.7rem', border: '1px solid var(--line)', fontFamily: 'var(--font-mono)' }}>{targetDate}</span>}
                  </div>
                )}
              </>
            )}


          </div>
        </div>

        {/* Reply form — full width below */}
        {isReplying && (
          <div style={{ marginTop: '0.75rem', paddingLeft: '58px' }}>
            <TweetEditor
              placeholder="Напиши ответ..." buttonText="Отправить"
              onCancel={() => onCancelReply && onCancelReply()}
              onSubmit={(ast, propsJson) => { if (onSubmitReply) onSubmitReply(note.id, ast, propsJson); }}
              autoFocus
            />
          </div>
        )}
      </div>{/* end card panel */}
    </div>
  );
};
