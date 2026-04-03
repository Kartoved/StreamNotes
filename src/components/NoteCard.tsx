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

  let baseBg = 'rgba(255,255,255,0.02)';
  if (status === 'done') baseBg = 'rgba(34, 197, 94, 0.1)';
  else if (status === 'todo') baseBg = 'rgba(239, 68, 68, 0.12)';
  else if (status === 'doing') baseBg = 'rgba(59, 130, 246, 0.1)';
  else if (status === 'archived') baseBg = 'rgba(15, 23, 42, 0.5)';

  let finalBg = isReplying ? 'rgba(167, 139, 250, 0.1)' : baseBg;
  if (isDragOverChild) finalBg = 'rgba(96, 165, 250, 0.15)';

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
        padding: '6px 6px 6px 6px',
        opacity: draggedId === note.id ? 0.3 : 1,
      }}
    >
      {/* Vertical connector line for nested notes — sits outside the card */}
      {note.depth > 0 && (
        <div style={{
          position: 'absolute',
          left: `calc(6px + ${indent - 10}px)`,
          top: 0, bottom: 0,
          width: '2px', background: 'var(--border)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── Card panel ────────────────────────────────────── */}
      <div style={{
        marginLeft: `${indent}px`,
        background: finalBg !== 'rgba(255,255,255,0.02)' ? finalBg : 'var(--card-bg)',
        border: isDragOverSibling
          ? '2px solid var(--accent)'
          : isDragOverChild
            ? '2px solid rgba(96,165,250,0.8)'
            : '1px solid var(--border)',
        borderRadius: '10px',
        padding: '8px 10px',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
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
          style={{ display: 'flex', gap: '8px', position: 'relative', zIndex: 2 }}
          onContextMenu={(e) => openContextMenu(e, note.id)}
        >
          {/* LEFT: avatar + name + time (clickable → navigate) */}
          <div
            onClick={(e) => { e.stopPropagation(); onNoteClick?.(note.id); }}
            style={{
              width: 50, flexShrink: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '2px', cursor: 'pointer', paddingTop: '1px', userSelect: 'none',
            }}
          >
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)' }} />
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-main)', textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.author_id}
            </span>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
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
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {type !== 'tweet' && <span style={{ background: 'rgba(147,197,253,0.12)', color: '#93c5fd', borderRadius: '4px', padding: '0px 6px', fontSize: '0.68rem' }}>{type}</span>}
                    {status !== 'none' && <span style={{ background: 'rgba(134,239,172,0.12)', color: '#86efac', borderRadius: '4px', padding: '0px 6px', fontSize: '0.68rem' }}>{status}</span>}
                    {targetDate && <span style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', borderRadius: '4px', padding: '0px 6px', fontSize: '0.68rem' }}>{targetDate}</span>}
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
