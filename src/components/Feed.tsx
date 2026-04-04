import React, { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotes } from '../db/hooks';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';
import { BacklinksSection } from './BacklinksSection';
import { NoteModal } from './NoteModal';
import { NoteCard } from './NoteCard';
interface FeedProps {
  parentId?: string | null;
  feedId?: string | null;
  onNoteClick?: (id: string) => void;
  replyingToId?: string | null;
  editingNote?: any | null;
  onStartReply?: (id: string) => void;
  onCancelReply?: () => void;
  onSubmitReply?: (parentId: string, text: string, propsJson: string) => void;
  onStartEdit?: (note: any) => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: (id: string, text: string, propsJson: string) => void;
  searchQuery?: string;
  selectedTags?: Set<string>;
  selectedDate?: string | null;
}

// Export helpers for use in sidebar
export { extractTags, extractPlainText };

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];
const TYPES = ['tweet', 'task', 'document'];

// Extract plain text from TipTap JSON for search
function extractPlainText(content: string): string {
  try {
    const doc = JSON.parse(content);
    const getText = (node: any): string => {
      if (node.type === 'text') return node.text || '';
      return (node.content || []).map(getText).join(' ');
    };
    return getText(doc);
  } catch {
    return content;
  }
}

// Extract #tags from note plain text
function extractTags(content: string): string[] {
  const text = extractPlainText(content);
  const matches = text.match(/#[\w\u0400-\u04FF][\w\u0400-\u04FF0-9_]*/gi) || [];
  return [...new Set(matches.map((t: string) => t.toLocaleLowerCase()))];
}



// ─── Feed ─────────────────────────────────────────────────────────────
export const Feed = ({
  parentId = null,
  feedId = null,
  onNoteClick,
  replyingToId,
  editingNote,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  searchQuery = '',
  selectedTags = new Set(),
  selectedDate = null,
}: FeedProps) => {
  const db = useDB();
  const { encrypt, decrypt } = useCrypto();
  const notes = useNotes(parentId, feedId);
  const parentRef = useRef<HTMLDivElement>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string; zone: 'sibling' | 'child' } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);

  const handleDeleteNote = async (id: string) => {
    await db.exec(`UPDATE notes SET is_deleted = 1 WHERE id = ?`, [id]);
    setDeleteConfirmId(null);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await db.exec(`UPDATE notes SET is_deleted = 1 WHERE id = ?`, [id]);
    }
    setSelectedIds(new Set());
    setBulkAction(null);
  };

  const openContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const closeContextMenu = () => setContextMenu(null);

  // ── Filter by search + tags + date ────────────────────────────────
  const filteredNotes = React.useMemo(() => {
    const q = searchQuery.toLocaleLowerCase().trim();
    const hasSearch = q.length > 0;
    const hasTags = selectedTags.size > 0;
    const hasDate = !!selectedDate;
    if (!hasSearch && !hasTags && !hasDate) return notes;

    const matchingIds = new Set<string>();
    for (const note of notes) {
      const text = extractPlainText(note.content).toLocaleLowerCase();
      const searchOk = !hasSearch || text.includes(q);
      const tagOk = !hasTags || [...selectedTags].every(tag => text.includes(tag));
      const dateOk = !hasDate || new Date(note.created_at).toISOString().slice(0, 10) === selectedDate;
      if (searchOk && tagOk && dateOk) matchingIds.add(note.id);
    }

    const parentOf = new Map(notes.map(n => [n.id, n.parent_id]));
    const toKeep = new Set<string>();
    for (const id of matchingIds) {
      let curr: string | null = id;
      while (curr) { toKeep.add(curr); curr = parentOf.get(curr) ?? null; }
    }
    for (const n of notes) {
      if (n.parent_id && toKeep.has(n.parent_id)) toKeep.add(n.id);
    }

    return notes.filter(n => toKeep.has(n.id));
  }, [notes, searchQuery, selectedTags, selectedDate]);

  const visibleNotes = React.useMemo(() => {
    const result = [];
    let hidingDepth = -1;
    for (const note of filteredNotes) {
      if (hidingDepth !== -1) {
        if (note.depth <= hidingDepth) hidingDepth = -1;
        else continue;
      }
      result.push(note);
      if (collapsedIds.has(note.id)) hidingDepth = note.depth;
    }
    return result;
  }, [filteredNotes, collapsedIds]);

  const virtualizer = useVirtualizer({
    count: visibleNotes.length,
    getScrollElement: () => document.querySelector('.main-content'),
    estimateSize: () => 92,
  });

  React.useEffect(() => {
    (window as any).scrollToNote = (id: string) => {
      const index = visibleNotes.findIndex(n => n.id === id);
      if (index !== -1) {
        virtualizer.scrollToIndex(index, { align: 'start' });
        setTimeout(() => {
          const el = parentRef.current?.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
          if (el) {
            el.style.transition = 'background 0.5s';
            el.style.background = 'var(--bg-active)';
            setTimeout(() => { el.style.background = ''; }, 1000);
          }
        }, 100);
      } else {
        onNoteClick?.(id);
      }
    };
  }, [visibleNotes, virtualizer, onNoteClick]);

  const updateProperty = async (id: string, currentPropsRaw: string, key: string, value: string) => {
    try {
      const props = JSON.parse(currentPropsRaw || '{}');
      props[key] = value;
      await db.exec(`UPDATE notes SET properties = ? WHERE id = ?`, [encrypt(JSON.stringify(props)), id]);
    } catch (e) { console.error(e); }
  };

  const handleDrop = async (targetId: string, zone: 'sibling' | 'child') => {
    if (!draggedId || draggedId === targetId) return;
    let isDescendant = false;
    let curr = targetId;
    while (curr) {
      const [row] = await db.execA(`SELECT parent_id FROM notes WHERE id = ?`, [curr]);
      if (!row) break;
      if (row[0] === draggedId) { isDescendant = true; break; }
      curr = row[0];
    }
    if (isDescendant) {
      alert('Нельзя перетащить заметку внутрь самой себя!');
      setDraggedId(null); setDragOverInfo(null);
      return;
    }
    if (zone === 'child') {
      await db.exec(`UPDATE notes SET parent_id = ? WHERE id = ?`, [targetId, draggedId]);
    } else {
      const [targetRow] = await db.execA(`SELECT parent_id, sort_key FROM notes WHERE id = ?`, [targetId]);
      if (targetRow) {
        await db.exec(`UPDATE notes SET parent_id = ?, sort_key = ? WHERE id = ?`, [targetRow[0], targetRow[1] + '9', draggedId]);
      }
    }
    setDraggedId(null); setDragOverInfo(null);
  };

  if (notes.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Пусто. Напиши что-нибудь первым!</div>;
  }

  const ConfirmModal = ({ text, onConfirm, onCancel }: { text: string; onConfirm: () => void; onCancel: () => void }) => (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '300px', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: 1.5 }}>{text}</div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontSize: '0.82rem' }}>Отмена</button>
          <button onClick={onConfirm} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>Удалить</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {expandedNoteId && (
        <NoteModal noteId={expandedNoteId} onClose={() => setExpandedNoteId(null)} />
      )}

      {deleteConfirmId && (
        <ConfirmModal
          text="Удалить эту заметку? Это действие нельзя отменить."
          onConfirm={() => handleDeleteNote(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {contextMenu && (
        <div
          onClick={closeContextMenu}
          onContextMenu={(e) => e.preventDefault()}
          style={{ position: 'fixed', inset: 0, zIndex: 4000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              background: 'var(--card-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '4px',
              minWidth: '180px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              zIndex: 4001,
            }}
          >
            {[
              { label: 'Ответить', action: () => { onStartReply?.(contextMenu.noteId); closeContextMenu(); } },
              { label: 'Редактировать', action: () => { const note = notes.find(n => n.id === contextMenu.noteId); if (note) onStartEdit?.(note); closeContextMenu(); } },
              { label: 'Открыть', action: () => { setExpandedNoteId(contextMenu.noteId); closeContextMenu(); } },
              { label: collapsedIds.has(contextMenu.noteId) ? 'Развернуть' : 'Свернуть', action: () => { setCollapsedIds(prev => { const next = new Set(prev); next.has(contextMenu.noteId) ? next.delete(contextMenu.noteId) : next.add(contextMenu.noteId); return next; }); closeContextMenu(); } },
              { label: '🔗 Перейти в ветку', action: () => { onNoteClick?.(contextMenu.noteId); closeContextMenu(); } },
              null, // separator
              { label: '🗑 Удалить', action: () => { setDeleteConfirmId(contextMenu.noteId); closeContextMenu(); }, danger: true },
            ].map((item, i) =>
              item === null ? (
                <div key={i} style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
              ) : (
                <button
                  key={i}
                  onClick={item.action}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    color: (item as any).danger ? '#f87171' : 'var(--text-main)',
                    padding: '7px 12px', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '13px', fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = (item as any).danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {item.label}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {bulkAction === 'confirm-delete' && (
        <ConfirmModal
          text={`Удалить ${selectedIds.size} ${selectedIds.size === 1 ? 'заметку' : selectedIds.size < 5 ? 'заметки' : 'заметок'}? Это действие нельзя отменить.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkAction(null)}
        />
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
        <button onClick={() => { if (collapsedIds.size > 0) setCollapsedIds(new Set()); else setCollapsedIds(new Set(notes.map(n => n.id))); }}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
          {collapsedIds.size > 0 ? 'Развернуть всё' : 'Свернуть всё'}
        </button>
      </div>

      {filteredNotes.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Ничего не найдено</div>
      ) : (
        <div ref={parentRef} className="feed-container">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const note = visibleNotes[virtualItem.index];

              let props: any = {};
              try { 
                const raw = decrypt(note.properties) || '{}';
                props = JSON.parse(raw); 
              } catch { /* */ }

              const status = props.status || 'none';
              const type = props.type || 'tweet';
              const targetDate = props.date || '';

              const indent = Math.min(note.depth * 24, 240);
              const isReplying = replyingToId === note.id;
              const isDragOverChild = dragOverInfo?.id === note.id && dragOverInfo.zone === 'child';
              const isDragOverSibling = dragOverInfo?.id === note.id && dragOverInfo.zone === 'sibling';

              let baseBg = 'transparent';
              if (status === 'done') baseBg = 'rgba(134, 239, 172, 0.04)';
              else if (status === 'todo') baseBg = 'rgba(239, 68, 68, 0.04)';
              else if (status === 'doing') baseBg = 'rgba(96, 165, 250, 0.04)';
              else if (status === 'archived') baseBg = 'rgba(15, 23, 42, 0.04)';

              let finalBg = isReplying ? 'rgba(167, 139, 250, 0.08)' : baseBg;

              return (
                <NoteCard
                  key={virtualItem.key}
                  note={note}
                  virtualItem={virtualItem}
                  virtualizer={virtualizer}
                  indent={indent}
                  isReplying={isReplying}
                  editingNoteId={editingNote?.id || null}
                  draggedId={draggedId}
                  dragOverInfo={dragOverInfo}
                  onNoteClick={onNoteClick}
                  openContextMenu={openContextMenu}
                  onDragStart={(e, id) => { setDraggedId(id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e, id) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const zone = (e.clientX - rect.left) < rect.width / 2 ? 'sibling' : 'child';
                    if (dragOverInfo?.id !== id || dragOverInfo?.zone !== zone) setDragOverInfo({ id, zone });
                  }}
                  onDragLeave={() => setDragOverInfo(null)}
                  onDrop={(e, id) => { e.preventDefault(); if (dragOverInfo) handleDrop(id, dragOverInfo.zone); }}
                  onDragEnd={() => { setDraggedId(null); setDragOverInfo(null); }}
                  onCancelEdit={onCancelEdit}
                  onSubmitEdit={onSubmitEdit}
                  onCancelReply={onCancelReply}
                  onSubmitReply={onSubmitReply}
                  onExpandNote={(id) => setExpandedNoteId(id)}
                  setDragOverInfo={setDragOverInfo}
                  encrypt={encrypt}
                  decrypt={decrypt}
                  db={db}
                />
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
