import React, { useRef, useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotes } from '../db/hooks';
import { extractPlainText, extractTags, getOrParse } from '../db/notesCache';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { storePendingBacklink } from '../utils/backlinkClipboard';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';
import { BacklinksSection } from './BacklinksSection';
import { NoteCard } from './NoteCard';
import { showToast } from './Toast';

// Lazy: only needed when user opens zen-mode or switches to kanban view.
const NoteModal = lazy(() => import('./NoteModal').then(m => ({ default: m.NoteModal })));
const KanbanView = lazy(() => import('./KanbanView').then(m => ({ default: m.KanbanView })));

/**
 * Returns a sort_key lexicographically between `after` and `before`.
 * Appends a single digit ('5' first, then lower) to `after` until a value
 * strictly between the two bounds is found. Recurses with '0' appended when
 * all single digits are exhausted (handles tightly-packed keys).
 */
function sortKeyBetween(after: string, before: string | null): string {
  if (!before) return after + '5';
  for (const d of ['5', '4', '3', '2', '1', '0']) {
    const candidate = after + d;
    if (candidate > after && candidate < before) return candidate;
  }
  return sortKeyBetween(after + '0', before);
}
interface FeedProps {
  parentId?: string | null;
  feedId?: string | null;
  isSharedFeed?: boolean;
  localNpub?: string;
  myRole?: 'owner' | 'admin' | 'participant' | 'reader';
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
  onStartPomodoro?: (taskId: string, taskTitle: string) => void;
}

// Export helpers for use in sidebar
export { extractTags, extractPlainText };

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];
const TYPES = ['sheaf', 'task', 'document'];

const EMPTY_TAGS: Set<string> = new Set();

// ─── Feed ─────────────────────────────────────────────────────────────
export const Feed = ({
  parentId = null,
  feedId = null,
  isSharedFeed = false,
  localNpub = '',
  myRole = 'owner',
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
  selectedTags = EMPTY_TAGS,
  selectedDate = null,
  statusFilter = null,
  onStartPomodoro,
}: FeedProps) => {
  const canWrite = myRole !== 'reader';
  const canEditOwn = myRole !== 'reader';
  const canEditAll = myRole === 'owner' || myRole === 'admin';
  const db = useDB();
  const { encrypt, decrypt, encryptForFeed, decryptForFeed } = useCrypto();

  // Feed-aware encrypt/decrypt helpers — memoised so NoteCard memo holds.
  const feedEncrypt = useCallback(
    (text: string) => feedId ? encryptForFeed(text, feedId) : encrypt(text),
    [feedId, encryptForFeed, encrypt]
  );
  const feedDecrypt = useCallback(
    (text: string) => feedId ? decryptForFeed(text, feedId) : decrypt(text),
    [feedId, decryptForFeed, decrypt]
  );
  const notes = useNotes(parentId, feedId);
  const parentRef = useRef<HTMLDivElement>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const setDraggedIdBoth = (id: string | null) => { draggedIdRef.current = id; setDraggedId(id); };
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string; zone: 'sibling' | 'child' } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);

  const [sortMode, setSortMode] = useState<'default' | 'date' | 'status' | 'created'>('default');
  const [groupMode, setGroupMode] = useState<'none' | 'date' | 'status'>('none');
  const [viewMode, setViewMode] = useState<'feed' | 'kanban'>('feed');

  // ── Touch drag-and-drop (mobile) ─────────────────────────────────
  const touchDragId = useRef<string | null>(null);
  const [touchDragActive, setTouchDragActive] = useState(false);
  const [touchGhostPos, setTouchGhostPos] = useState({ x: 0, y: 0 });
  const [touchGhostText, setTouchGhostText] = useState('');

  const handleTouchDragStart = (noteId: string, startTouch: { clientX: number; clientY: number }) => {
    touchDragId.current = noteId;
    setDraggedIdBoth(noteId);
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

    const cleanup = () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
      touchDragId.current = null;
      setTouchDragActive(false);
      setDraggedIdBoth(null);
      setDragOverInfo(null);
    };

    const onTouchCancel = () => cleanup();

    const onEnd = (ev: TouchEvent) => {
      // Remove all listeners first
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onTouchCancel);

      const currentDragOverInfo = dragOverInfoRef.current;
      const currentDraggedId = draggedIdRef.current;
      if (currentDragOverInfo && currentDraggedId) {
        const dropDraggedId = currentDraggedId;
        (async () => {
          const targetId = currentDragOverInfo.id;
          const zone = currentDragOverInfo.zone;
          if (!dropDraggedId || dropDraggedId === targetId) return;
          let isDescendant = false;
          let curr: string | null = targetId;
          while (curr) {
            const rows: any[] = await db.execA(`SELECT parent_id FROM notes WHERE id = ?`, [curr]);
            const row = rows[0];
            if (!row) break;
            if (row[0] === dropDraggedId) { isDescendant = true; break; }
            curr = row[0];
          }
          if (isDescendant) { showToast('Нельзя перетащить заметку внутрь самой себя!', 'error'); return; }
          if (zone === 'child') {
            await db.exec(`UPDATE notes SET parent_id = ? WHERE id = ?`, [targetId, dropDraggedId]);
          } else {
            const rows2: any[] = await db.execA(`SELECT parent_id, sort_key FROM notes WHERE id = ?`, [targetId]);
            const targetRow = rows2[0];
            if (targetRow) {
              const parentId = targetRow[0];
              const targetKey = targetRow[1] ?? '';
              const nextRows: any[] = await db.execA(
                `SELECT sort_key FROM notes WHERE parent_id IS ? AND sort_key > ? AND is_deleted = 0 ORDER BY sort_key ASC LIMIT 1`,
                [parentId, targetKey]
              );
              const newKey = sortKeyBetween(targetKey, nextRows[0]?.[0] ?? null);
              await db.exec(`UPDATE notes SET parent_id = ?, sort_key = ? WHERE id = ?`, [parentId, newKey, dropDraggedId]);
            }
          }
          if (navigator.vibrate) navigator.vibrate(30);
        })();
      }
      touchDragId.current = null;
      setTouchDragActive(false);
      setDraggedIdBoth(null);
      setDragOverInfo(null);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { once: true });
    window.addEventListener('touchcancel', onTouchCancel, { once: true });
  };

  // Keep refs for access inside touch event closures (avoid stale captures)
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

  const openContextMenu = useCallback((e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  }, []);

  const openContextMenuAt = useCallback((x: number, y: number, noteId: string) => {
    setContextMenu({ x, y, noteId });
  }, []);

  const closeContextMenu = () => setContextMenu(null);

  // ── Pre-parse properties + plain text once (reused by filter & sort) ──
  // Backed by module-level cache keyed by id+updated_at, so unchanged notes
  // skip JSON.parse and TipTap traversal across feed/view switches.
  const parsedCache = React.useMemo(() => {
    const m = new Map<string, { props: any; text: string }>();
    for (const note of notes) {
      m.set(note.id, getOrParse(note.id, note.updated_at, note.content, note.properties));
    }
    return m;
  }, [notes]);

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
      const cached = parsedCache.get(note.id);
      const text = cached?.text ?? '';
      const searchOk = !hasSearch || text.includes(q);
      const tagOk = !hasTags || [...selectedTags].every(tag => text.includes(tag));
      let dateOk = true;
      if (hasDate) {
        const props = cached?.props ?? {};
        const propsDate = props.date ? props.date.slice(0, 10) : null;
        const createdDate = new Date(note.created_at).toISOString().slice(0, 10);
        dateOk = propsDate === selectedDate || (!propsDate && createdDate === selectedDate);
      }
      let statusOk = true;
      if (hasStatus) {
        const props = cached?.props ?? {};
        if (statusFilter === 'todo') {
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const noteDate = props.date ? props.date.slice(0, 10) : null;
          statusOk = props.status === 'todo' && !!noteDate && noteDate <= todayStr;
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
  }, [notes, parsedCache, searchQuery, selectedTags, selectedDate, statusFilter]);

  const visibleNotes = React.useMemo(() => {
    let base = [...filteredNotes];
    const isFlat = sortMode !== 'default' || groupMode !== 'none';

    if (isFlat) {
      if (sortMode === 'date') {
        base.sort((a, b) => {
          const da = (parsedCache.get(a.id)?.props.date) || '9999-12-31';
          const db_ = (parsedCache.get(b.id)?.props.date) || '9999-12-31';
          return da.localeCompare(db_) || b.created_at - a.created_at;
        });
      } else if (sortMode === 'status') {
        const order: any = { 'doing': 0, 'todo': 1, 'none': 2, 'done': 3, 'archived': 4 };
        base.sort((a, b) => {
          const sa = (parsedCache.get(a.id)?.props.status) || 'none';
          const sb = (parsedCache.get(b.id)?.props.status) || 'none';
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
        const p = parsedCache.get(n.id)?.props ?? {};
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
        const d = (parsedCache.get(n.id)?.props.date) || 'Неразобранные';
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
  }, [filteredNotes, parsedCache, collapsedIds, sortMode, groupMode]);

  const scrollElRef = useRef<HTMLElement | null>(null);
  const virtualizer = useVirtualizer({
    count: visibleNotes.length,
    getScrollElement: () => {
      if (!scrollElRef.current && typeof document !== 'undefined') {
        scrollElRef.current = document.querySelector('.main-content');
      }
      return scrollElRef.current;
    },
    estimateSize: (i) => {
      if (visibleNotes[i]?.type === 'header') return 32;
      return typeof window !== 'undefined' && window.innerWidth <= 640 ? 140 : 100;
    },
    overscan: typeof window !== 'undefined' && window.innerWidth <= 640 ? 3 : 5,
  });
  // Derived directly from virtualizer state — no listener needed.
  // The virtualizer re-renders the component on every scroll tick.
  const showScrollTop = (virtualizer.scrollOffset ?? 0) > 300;

  // Reset scroll + collapsed state whenever a filter activates
  React.useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0 });
    virtualizer.scrollToOffset(0);
    if (searchQuery.trim() || selectedDate || statusFilter || selectedTags.size > 0) {
      setCollapsedIds(prev => prev.size === 0 ? prev : new Set());
    }
  }, [searchQuery, selectedDate, statusFilter, selectedTags]);

  const scrollToTop = () => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    virtualizer.scrollToOffset(0);
  };

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

  // Stable across renders — reads drag state from refs so NoteCard's onDrop
  // callback can also be a stable useCallback (key for memo-ing 3000+ cards).
  const handleDrop = useCallback(async (targetId: string, zone: 'sibling' | 'child') => {
    const dragged = draggedIdRef.current;
    if (!dragged || dragged === targetId) return;
    let isDescendant = false;
    let curr = targetId;
    while (curr) {
      const [row] = await db.execA(`SELECT parent_id FROM notes WHERE id = ?`, [curr]);
      if (!row) break;
      if (row[0] === dragged) { isDescendant = true; break; }
      curr = row[0];
    }
    if (isDescendant) {
      showToast('Нельзя перетащить заметку внутрь самой себя!', 'error');
      setDraggedIdBoth(null); setDragOverInfo(null);
      return;
    }
    if (zone === 'child') {
      await db.exec(`UPDATE notes SET parent_id = ? WHERE id = ?`, [targetId, dragged]);
    } else {
      const [targetRow] = await db.execA(`SELECT parent_id, sort_key FROM notes WHERE id = ?`, [targetId]);
      if (targetRow) {
        const parentId = targetRow[0];
        const targetKey = targetRow[1] ?? '';
        const [nextRow] = await db.execA(
          `SELECT sort_key FROM notes WHERE parent_id IS ? AND sort_key > ? AND is_deleted = 0 ORDER BY sort_key ASC LIMIT 1`,
          [parentId, targetKey]
        );
        const newKey = sortKeyBetween(targetKey, nextRow?.[0] ?? null);
        await db.exec(`UPDATE notes SET parent_id = ?, sort_key = ? WHERE id = ?`, [parentId, newKey, dragged]);
      }
    }
    setDraggedIdBoth(null); setDragOverInfo(null);
  }, [db]);

  const handleNcDrop = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    const info = dragOverInfoRef.current;
    if (info) handleDrop(id, info.zone);
  }, [handleDrop]);

  // Stable callbacks for NoteCard (avoids re-render from new function refs)
  const handleNcDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedIdBoth(id); e.dataTransfer.effectAllowed = 'move';
  }, []);
  const handleNcDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const zone: 'sibling' | 'child' = (e.clientX - rect.left) < rect.width / 2 ? 'sibling' : 'child';
    setDragOverInfo(prev => prev?.id === id && prev?.zone === zone ? prev : { id, zone });
  }, []);
  const handleNcDragLeave = useCallback(() => setDragOverInfo(null), []);
  const handleNcDragEnd = useCallback(() => { setDraggedIdBoth(null); setDragOverInfo(null); }, []);
  const handleNcExpandNote = useCallback((id: string) => {
    if (window.innerWidth <= 640) {
      const n = notes.find(nn => nn.id === id);
      if (n && onStartEdit) { onStartEdit(n); return; }
    }
    setExpandedNoteId(id);
  }, [notes, onStartEdit]);

  if (notes.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Пусто. Напиши что-нибудь первым!</div>;
  }

  const ConfirmModal = ({ text, onConfirm, onCancel }: { text: string; onConfirm: () => void; onCancel: () => void }) => (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
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
        <Suspense fallback={null}>
          <NoteModal noteId={expandedNoteId} onClose={() => setExpandedNoteId(null)} />
        </Suspense>
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
              top: `min(${contextMenu.y}px, calc(100dvh - 300px - env(safe-area-inset-bottom, 0px)))`,
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
            {(() => {
              const ctxNote = notes.find(n => n.id === contextMenu.noteId);
              const isOwn = !ctxNote || ctxNote.author_id === localNpub;
              const userCanEdit = canEditAll || (canEditOwn && isOwn);
              const userCanDelete = canEditAll || (canEditOwn && isOwn);
              // Build items: true-null = separator, false = omitted
              const raw: (false | null | { label: string; action: () => void; danger?: boolean })[] = [
                canWrite && { label: 'Ответить', action: () => { onStartReply?.(contextMenu.noteId); closeContextMenu(); } },
                userCanEdit && { label: 'Редактировать', action: () => { if (ctxNote) onStartEdit?.(ctxNote); closeContextMenu(); } },
                { label: 'Открыть', action: () => { handleNcExpandNote(contextMenu.noteId); closeContextMenu(); } },
                { label: collapsedIds.has(contextMenu.noteId) ? 'Развернуть' : 'Свернуть', action: () => { setCollapsedIds(prev => { const next = new Set(prev); next.has(contextMenu.noteId) ? next.delete(contextMenu.noteId) : next.add(contextMenu.noteId); return next; }); closeContextMenu(); } },
                { label: '🔗 Перейти в ветку', action: () => { onNoteClick?.(contextMenu.noteId); closeContextMenu(); } },
                { label: '⎘ Скопировать как ссылку', action: () => {
                  if (ctxNote) {
                    const title = extractPlainText(feedDecrypt(ctxNote.content)).slice(0, 80) || ctxNote.id;
                    storePendingBacklink(ctxNote.id, title);
                  }
                  closeContextMenu();
                }},
                ...(canWrite ? [null as null, { label: ctxNote?.is_pinned ? '📌 Открепить' : '📌 Закрепить', action: async () => { await db.exec(`UPDATE notes SET is_pinned = ? WHERE id = ?`, [ctxNote?.is_pinned ? 0 : 1, contextMenu.noteId]); closeContextMenu(); } }] : []),
                ...(onStartPomodoro ? [null as null, { label: '🍅 Запустить помидор', action: () => { const note = notes.find(n => n.id === contextMenu.noteId); const title = note ? extractPlainText(note.content).slice(0, 60) || 'Задача' : 'Задача'; onStartPomodoro(contextMenu.noteId, title); closeContextMenu(); } }] : []),
                ...(userCanDelete ? [null as null, { label: '🗑 Удалить', action: () => { setDeleteConfirmId(contextMenu.noteId); closeContextMenu(); }, danger: true }] : []),
              ];
              return raw.filter(x => x !== false);
            })().map((item, i) =>
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 100, paddingTop: '8px', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', padding: '2px', border: '1px solid var(--line)' }}>
          <button onClick={() => { if (collapsedIds.size > 0) setCollapsedIds(new Set()); else setCollapsedIds(new Set(notes.map(n => n.id))); }}
            style={{ background: 'var(--bg)', color: 'var(--text)', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 600, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transition: 'all 0.1s', fontFamily: 'var(--font-body)' }}>
            {collapsedIds.size > 0 ? 'Развернуть всё' : 'Свернуть всё'}
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* View mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', padding: '2px', border: '1px solid var(--line)' }}>
            {[
              { id: 'feed', label: 'Лента', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
              { id: 'kanban', label: 'Канбан', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg> },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setViewMode(opt.id as any)}
                title={`Вид: ${opt.label}`}
                style={{
                  background: viewMode === opt.id ? 'var(--bg)' : 'transparent',
                  color: viewMode === opt.id ? 'var(--text)' : 'var(--text-faint)',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.7rem',
                  fontWeight: viewMode === opt.id ? 600 : 400,
                  boxShadow: viewMode === opt.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.1s'
                }}
              >
                {opt.icon}
                <span className="feed-toolbar-label">{opt.label}</span>
              </button>
            ))}
          </div>

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

      {viewMode === 'kanban' ? (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>загрузка…</div>}>
        <KanbanView
          notes={filteredNotes}
          parsedCache={parsedCache}
          db={db}
          feedEncrypt={feedEncrypt}
          onNoteClick={onNoteClick}
          canWrite={canWrite}
        />
        </Suspense>
      ) : filteredNotes.length === 0 ? (
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
                  onDragStart={handleNcDragStart}
                  onDragOver={handleNcDragOver}
                  onDragLeave={handleNcDragLeave}
                  onDrop={handleNcDrop}
                  onDragEnd={handleNcDragEnd}
                  onCancelEdit={onCancelEdit}
                  onSubmitEdit={onSubmitEdit}
                  onCancelReply={onCancelReply}
                  onSubmitReply={onSubmitReply}
                  onExpandNote={handleNcExpandNote}
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

      {/* Scroll to top button */}
      {showScrollTop && createPortal(
        <button
          onClick={scrollToTop}
          aria-label="Наверх"
          className="scroll-to-top-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6"/>
          </svg>
        </button>,
        document.body
      )}

      {/* Touch drag ghost */}
      {touchDragActive && createPortal(
        <div style={{
          position: 'fixed',
          left: touchGhostPos.x - 110,
          top: touchGhostPos.y - 36,
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
