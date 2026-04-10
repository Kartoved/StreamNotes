import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  isSharedFeed?: boolean;
  localNpub?: string;
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
  statusFilter?: string | null;
}

// Export helpers for use in sidebar
export { extractTags, extractPlainText };

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];
const TYPES = ['sheaf', 'task', 'document'];

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
  isSharedFeed = false,
  localNpub = '',
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
  statusFilter = null,
}: FeedProps) => {
  const db = useDB();
  const { encrypt, decrypt, encryptForFeed, decryptForFeed } = useCrypto();

  // Feed-aware encrypt/decrypt helpers
  const feedEncrypt = (text: string) => feedId ? encryptForFeed(text, feedId) : encrypt(text);
  const feedDecrypt = (text: string) => feedId ? decryptForFeed(text, feedId) : decrypt(text);
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

  const [sortMode, setSortMode] = useState<'default' | 'date' | 'status' | 'created'>('default');
  const [groupMode, setGroupMode] = useState<'none' | 'date' | 'status'>('none');

  // ── Touch drag-and-drop (mobile) ─────────────────────────────────
  const touchDragId = useRef<string | null>(null);
  const [touchDragActive, setTouchDragActive] = useState(false);
  const [touchGhostPos, setTouchGhostPos] = useState({ x: 0, y: 0 });
  const [touchGhostText, setTouchGhostText] = useState('');

  const handleTouchDragStart = (noteId: string, startTouch: { clientX: number; clientY: number }) => {
    touchDragId.current = noteId;
    setDraggedId(noteId);
    setTouchDragActive(true);
    setTouchGhostPos({ x: startTouch.clientX, y: startTouch.clientY });
    const noteItem = visibleNotes.find(n => n.type === 'note' && n.note?.id === noteId);
    if (noteItem && noteItem.type === 'note') {
      setTouchGhostText(extractPlainText(noteItem.note.content).slice(0, 60) || '...');
    }
    if (navigator.vibrate) navigator.vibrate(40);

    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const t = ev.touches[0];
      setTouchGhostPos({ x: t.clientX, y: t.clientY });

      // Find target note under finger
      const els = document.elementsFromPoint(t.clientX, t.clientY);
      const noteEl = els.find(el =>
        (el as HTMLElement).dataset?.noteId &&
        (el as HTMLElement).dataset.noteId !== touchDragId.current
      ) as HTMLElement | null;

      if (noteEl) {
        const targetId = noteEl.dataset.noteId!;
        const rect = noteEl.getBoundingClientRect();
        // Left half = sibling (before), right half = child (nest under)
        const zone: 'sibling' | 'child' = (t.clientX - rect.left) < rect.width * 0.55 ? 'sibling' : 'child';
        setDragOverInfo(prev =>
          prev?.id === targetId && prev?.zone === zone ? prev : { id: targetId, zone }
        );
      } else {
        setDragOverInfo(null);
      }
    };

    const onEnd = (ev: TouchEvent) => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);

      const currentDragOverInfo = dragOverInfoRef.current;
      if (currentDragOverInfo && touchDragId.current) {
        handleDrop(currentDragOverInfo.id, currentDragOverInfo.zone);
      }
      touchDragId.current = null;
      setTouchDragActive(false);
      setDraggedId(null);
      setDragOverInfo(null);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { once: true });
  };

  // Keep a ref of dragOverInfo for access inside touch closures
  const dragOverInfoRef = useRef(dragOverInfo);
  useEffect(() => { dragOverInfoRef.current = dragOverInfo; }, [dragOverInfo]);

  const deleteWithChildren = async (id: string) => {
    // Recursively soft-delete the note and all its descendants
    await db.exec(`
      WITH RECURSIVE subtree AS (
        SELECT id FROM notes WHERE id = ?
        UNION ALL
        SELECT n.id FROM notes n JOIN subtree s ON n.parent_id = s.id
      )
      UPDATE notes SET is_deleted = 1 WHERE id IN (SELECT id FROM subtree)
    `, [id]);
  };

  const handleDeleteNote = async (id: string) => {
    await deleteWithChildren(id);
    setDeleteConfirmId(null);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteWithChildren(id);
    }
    setSelectedIds(new Set());
    setBulkAction(null);
  };

  const openContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const openContextMenuAt = (x: number, y: number, noteId: string) => {
    setContextMenu({ x, y, noteId });
  };

  const closeContextMenu = () => setContextMenu(null);

  // ── Filter by search + tags + date + status ───────────────────────
  const filteredNotes = React.useMemo(() => {
    const q = searchQuery.toLocaleLowerCase().trim();
    const hasSearch = q.length > 0;
    const hasTags = selectedTags.size > 0;
    const hasDate = !!selectedDate;
    const hasStatus = !!statusFilter;
    if (!hasSearch && !hasTags && !hasDate && !hasStatus) return notes;

    const matchingIds = new Set<string>();
    for (const note of notes) {
      const text = extractPlainText(note.content).toLocaleLowerCase();
      const searchOk = !hasSearch || text.includes(q);
      const tagOk = !hasTags || [...selectedTags].every(tag => text.includes(tag));
      let dateOk = true;
      if (hasDate) {
        try {
          const props = JSON.parse(note.properties || '{}');
          const propsDate = props.date ? props.date.slice(0, 10) : null;
          const createdDate = new Date(note.created_at).toISOString().slice(0, 10);
          dateOk = propsDate === selectedDate || (!propsDate && createdDate === selectedDate);
        } catch {
          dateOk = new Date(note.created_at).toISOString().slice(0, 10) === selectedDate;
        }
      }
      let statusOk = true;
      if (hasStatus) {
        try {
          const props = JSON.parse(note.properties || '{}');
          if (statusFilter === 'todo') {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const noteDate = props.date ? props.date.slice(0, 10) : null;
            statusOk = props.status === 'todo' && (!noteDate || noteDate <= todayStr);
          } else if (statusFilter === 'todo-no-date') {
            statusOk = props.status === 'todo' && !props.date;
          } else if (statusFilter === 'todo-future') {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const noteDate = props.date ? props.date.slice(0, 10) : null;
            statusOk = props.status === 'todo' && noteDate && noteDate > todayStr;
          } else if (statusFilter === 'doing') {
            statusOk = props.status === 'doing';
          } else if (statusFilter === 'done') {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const completedAt = props.completed_at ? props.completed_at.slice(0, 10) : null;
            statusOk = props.status === 'done' && completedAt === todayStr;
          } else {
            statusOk = props.status === statusFilter;
          }
        } catch { statusOk = false; }
      }
      if (searchOk && tagOk && dateOk && statusOk) matchingIds.add(note.id);

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
  }, [notes, searchQuery, selectedTags, selectedDate, statusFilter]);

  const visibleNotes = React.useMemo(() => {
    let base = [...filteredNotes];
    const isFlat = sortMode !== 'default' || groupMode !== 'none';

    if (isFlat) {
      if (sortMode === 'date') {
        base.sort((a, b) => {
          const pa = JSON.parse(a.properties || '{}');
          const pb = JSON.parse(b.properties || '{}');
          const da = pa.date || '9999-12-31';
          const db = pb.date || '9999-12-31';
          return da.localeCompare(db) || b.created_at - a.created_at;
        });
      } else if (sortMode === 'status') {
        const order: any = { 'doing': 0, 'todo': 1, 'none': 2, 'done': 3, 'archived': 4 };
        base.sort((a, b) => {
          const sa = JSON.parse(a.properties || '{}').status || 'none';
          const sb = JSON.parse(b.properties || '{}').status || 'none';
          return (order[sa] ?? 2) - (order[sb] ?? 2) || b.created_at - a.created_at;
        });
      } else if (sortMode === 'created') {
        base.sort((a, b) => b.created_at - a.created_at);
      }
    }

    const result: any[] = [];
    if (groupMode === 'status' && isFlat) {
      const groups: any = { 'doing': [], 'todo': [], 'todo-no-date': [], 'none': [], 'done': [], 'archived': [] };
      const labels: any = { 'doing': 'В процессе', 'todo': 'Нужно сделать', 'todo-no-date': 'Неразобранные', 'none': 'Заметки', 'done': 'Выполнено', 'archived': 'Архив' };
      base.forEach(n => {
        const p = JSON.parse(n.properties || '{}');
        const s = p.status || 'none';
        if (s === 'todo' && !p.date) {
          groups['todo-no-date'].push(n);
        } else if (groups[s]) {
          groups[s].push(n);
        } else {
          groups['none'].push(n);
        }
      });
      ['doing', 'todo', 'todo-no-date', 'none', 'done', 'archived'].forEach(k => {
        if (groups[k].length > 0) {
          result.push({ type: 'header', label: labels[k], count: groups[k].length });
          groups[k].forEach((n: any) => result.push({ type: 'note', note: n }));
        }
      });
    } else if (groupMode === 'date' && isFlat) {
      const groups: Map<string, any[]> = new Map();
      base.forEach(n => {
        const d = JSON.parse(n.properties || '{}').date || 'Неразобранные';
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d)!.push(n);
      });
      const sortedDates = [...groups.keys()].sort((a, b) => {
        if (a === 'Неразобранные') return 1;
        if (b === 'Неразобранные') return -1;
        return a.localeCompare(b);
      });
      sortedDates.forEach(d => {
        result.push({ type: 'header', label: d, count: groups.get(d)!.length });
        groups.get(d)!.forEach(n => result.push({ type: 'note', note: n }));
      });
    } else {
      let hidingDepth = -1;
      for (const note of base) {
        if (!isFlat && hidingDepth !== -1) {
          if (note.depth <= hidingDepth) hidingDepth = -1;
          else continue;
        }
        result.push({ type: 'note', note });
        if (!isFlat && collapsedIds.has(note.id)) hidingDepth = note.depth;
      }
    }
    return result;
  }, [filteredNotes, collapsedIds, sortMode, groupMode]);

  const virtualizer = useVirtualizer({
    count: visibleNotes.length,
    getScrollElement: () => document.querySelector('.main-content'),
    estimateSize: (i) => visibleNotes[i]?.type === 'header' ? 32 : 100,
    overscan: 5,
  });

  // Reset scroll to top whenever a filter changes so the virtualizer
  // doesn't start mid-list with a stale offset
  React.useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0 });
    virtualizer.scrollToOffset(0);
  }, [searchQuery, selectedDate, statusFilter, selectedTags]);

  React.useEffect(() => {
    (window as any).scrollToNote = (id: string) => {
      const index = visibleNotes.findIndex(n => n.type === 'note' && n.note.id === id);
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
      await db.exec(`UPDATE notes SET properties = ? WHERE id = ?`, [feedEncrypt(JSON.stringify(props)), id]);
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
              top: Math.min(contextMenu.y, window.innerHeight - 300),
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              background: 'var(--card-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '6px',
              minWidth: '190px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
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
                    color: (item as any).danger ? '#f87171' : 'var(--text)',
                    padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '14px', fontFamily: 'inherit',
                    transition: 'background 0.1s',
                    minHeight: '44px',
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
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => { if (collapsedIds.size > 0) setCollapsedIds(new Set()); else setCollapsedIds(new Set(notes.map(n => n.id))); }}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-sub)', padding: '4px 10px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'var(--font-body)' }}>
          {collapsedIds.size > 0 ? 'Развернуть всё' : 'Свернуть всё'}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Grouping */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', padding: '2px', border: '1px solid var(--line)' }}>
             {[
               { id: 'none', label: 'Дерево', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L12 22"/><path d="M12 8L20 8"/><path d="M12 16L20 16"/></svg> },
               { id: 'status', label: 'Статусы', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8V12L14 14"/></svg> },
               { id: 'date', label: 'Даты', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
             ].map(opt => (
               <button
                 key={opt.id}
                 onClick={() => setGroupMode(opt.id as any)}
                 title={`Группировка: ${opt.label}`}
                 style={{
                   background: groupMode === opt.id ? 'var(--bg)' : 'transparent',
                   color: groupMode === opt.id ? 'var(--text)' : 'var(--text-faint)',
                   border: 'none',
                   padding: '4px 8px',
                   borderRadius: '4px',
                   cursor: 'pointer',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '4px',
                   fontSize: '0.7rem',
                   fontWeight: groupMode === opt.id ? 600 : 400,
                   boxShadow: groupMode === opt.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                   transition: 'all 0.1s'
                 }}
               >
                 {opt.icon}
                 <span className="feed-toolbar-label">{opt.label}</span>
               </button>
             ))}
          </div>

          {/* Sorting - only show if flat */}
          {(groupMode !== 'none' || sortMode !== 'default') && (
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              style={{
                background: 'var(--bg-hover)',
                color: 'var(--text-sub)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-body)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="default">По умолчанию</option>
              <option value="created">По дате создания</option>
              <option value="date">По дате задачи</option>
              <option value="status">По статусу</option>
            </select>
          )}
        </div>
      </div>

      {filteredNotes.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Ничего не найдено</div>
      ) : (
        <div ref={parentRef} className="feed-container">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = visibleNotes[virtualItem.index];

              if (item.type === 'header') {
                return (
                  <div
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    style={{
                      position: 'absolute', top: 0, left: 0, width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                      padding: '16px 8px 0px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-faint)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>{item.label}</span>
                    <span style={{ fontWeight: 400, opacity: 0.6 }}>({item.count})</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--line)', opacity: 0.5 }} />
                  </div>
                );
              }

              const note = item.note;
              const isFlat = sortMode !== 'default' || groupMode !== 'none';

              let props: any = {};
              try {
                const raw = feedDecrypt(note.properties) || '{}';
                props = JSON.parse(raw);
              } catch { /* */ }

              const status = props.status || 'none';
              const type = props.type || 'sheaf';
              const targetDate = props.date || '';

              const indent = Math.min(note.depth * 24, 240);
              const isReplying = replyingToId === note.id;
              const isDragOverChild = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'child';
              const isDragOverSibling = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'sibling';

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
                  openContextMenuAt={openContextMenuAt}
                  onStartReply={onStartReply}
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
                  encrypt={feedEncrypt}
                  decrypt={feedDecrypt}
                  db={db}
                  isSharedFeed={isSharedFeed}
                  localNpub={localNpub}
                  onTouchDragStart={handleTouchDragStart}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Touch drag ghost */}
      {touchDragActive && createPortal(
        <div style={{
          position: 'fixed',
          left: touchGhostPos.x + 12,
          top: touchGhostPos.y - 20,
          zIndex: 9999,
          background: 'var(--card-bg)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          padding: '8px 14px',
          fontSize: '0.82rem',
          color: 'var(--text)',
          maxWidth: '220px',
          opacity: 0.92,
          pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          transform: 'rotate(1.5deg)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontFamily: 'var(--font-body)',
        }}>
          {touchGhostText}
        </div>,
        document.body
      )}
    </>
  );
};
