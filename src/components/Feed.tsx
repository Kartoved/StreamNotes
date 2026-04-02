import React, { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotes } from '../db/hooks';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { TweetEditor, TiptapRender } from './TiptapEditor';

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

// ─── Backlinks Section ────────────────────────────────────────────────
const BacklinksSection = ({ noteId, onNoteClick }: { noteId: string; onNoteClick?: (id: string) => void }) => {
  const db = useDB();
  const { decrypt } = useCrypto();
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  React.useEffect(() => {
    (window as any).onNoteClick = onNoteClick;
  }, [onNoteClick]);

  React.useEffect(() => {
    if (!db || !noteId) return;
    db.execO(`SELECT id, content FROM notes WHERE is_deleted = 0`)
      .then(res => {
        const matches = (res || []).filter((r: any) => {
          const plain = decrypt(r.content);
          return plain.includes(`note://${noteId}`);
        }).map((r: any) => ({ ...r, content: decrypt(r.content) }));
        setBacklinks(matches);
      })
      .catch(() => setBacklinks([]));
  }, [db, noteId, isExpanded, decrypt]);

  if (!backlinks || backlinks.length === 0) return null;

  return (
    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
        style={{ background: 'none', border: 'none', color: '#93c5fd', fontSize: '0.72rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        🔗 {isExpanded ? '▼' : '▶'} Упомянуто в {backlinks.length} {backlinks.length === 1 ? 'заметке' : 'заметках'}
      </button>
      {isExpanded && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {backlinks.map(b => (
            <div key={b.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 10px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.45 }}>
                <TiptapRender astString={b.content} />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onNoteClick?.(b.id); }}
                style={{ marginTop: '4px', background: 'none', border: 'none', color: '#93c5fd', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
              >
                → Перейти к заметке
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Note Modal (fullscreen overlay) ─────────────────────────────────
const NoteModal = ({ noteId, onClose, onNoteClick }: { noteId: string; onClose: () => void; onNoteClick?: (id: string) => void }) => {
  const db = useDB();
  const { encrypt, decrypt } = useCrypto();
  const [note, setNote] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<any>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const load = React.useCallback(async () => {
    if (!db) return;
    const [row] = await db.execO(`SELECT * FROM notes WHERE id = ?`, [noteId]);
    if (row) setNote({ ...(row as any), content: decrypt((row as any).content), properties: decrypt((row as any).properties) });
    const rows = await db.execO(`
      WITH RECURSIVE tree(id, parent_id, author_id, content, sort_key, properties, created_at, updated_at, depth) AS (
        SELECT id, parent_id, author_id, content, sort_key, properties, created_at, updated_at, 0
        FROM notes WHERE parent_id = ?
        UNION ALL
        SELECT n.id, n.parent_id, n.author_id, n.content, n.sort_key, n.properties, n.created_at, n.updated_at, t.depth + 1
        FROM notes n JOIN tree t ON n.parent_id = t.id
      )
      SELECT * FROM tree ORDER BY depth, sort_key
    `, [noteId]);
    setChildren((rows || []).map((r: any) => ({ ...r, content: decrypt(r.content), properties: decrypt(r.properties) })));
  }, [db, noteId]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (!db) return; return db.onUpdate(() => load()); }, [db, load]);

  if (!note) return null;

  let props: any = {};
  try { props = JSON.parse(note.properties || '{}'); } catch { /* */ }

  const handleSubmitReply = async (parentId: string, ast: string, propsJson: string) => {
    const id = 'note-' + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, parentId, 'local-user', encrypt(ast), now.toString(), encrypt(propsJson), now, now]
    );
    setReplyingToId(null);
  };

  const handleSubmitEdit = async (id: string, ast: string, propsJson: string) => {
    await db.exec(`UPDATE notes SET content = ?, properties = ?, updated_at = ? WHERE id = ?`, [encrypt(ast), encrypt(propsJson), Date.now(), id]);
    setEditingNote(null);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '760px', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{note.author_id}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(note.created_at).toLocaleString()}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button onClick={() => { onNoteClick?.(noteId); onClose(); }} style={{ background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '6px', padding: '2px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>→ В ленте</button>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.85rem', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Props badges */}
        {(props.status || props.type || props.date) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {props.type && props.type !== 'tweet' && <span style={{ background: 'rgba(147,197,253,0.1)', color: '#93c5fd', borderRadius: '4px', padding: '1px 7px', fontSize: '0.72rem' }}>{props.type}</span>}
            {props.status && props.status !== 'none' && <span style={{ background: 'rgba(134,239,172,0.1)', color: '#86efac', borderRadius: '4px', padding: '1px 7px', fontSize: '0.72rem' }}>{props.status}</span>}
            {props.date && <span style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', borderRadius: '4px', padding: '1px 7px', fontSize: '0.72rem' }}>{props.date}</span>}
          </div>
        )}

        {/* Content */}
        {editingNote?.id === noteId ? (
          <TweetEditor initialAst={note.content} initialPropsStr={note.properties} placeholder="Редактировать..." buttonText="Сохранить" onCancel={() => setEditingNote(null)} onSubmit={(ast, propsJson) => handleSubmitEdit(noteId, ast, propsJson)} autoFocus />
        ) : (
          <div style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--text-main)' }}>
            <TiptapRender astString={note.content} onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [encrypt(newAst), noteId])} />
          </div>
        )}

        {replyingToId === noteId && (
          <TweetEditor placeholder="Напиши ответ..." buttonText="Отправить" onCancel={() => setReplyingToId(null)} onSubmit={(ast, propsJson) => handleSubmitReply(noteId, ast, propsJson)} autoFocus />
        )}

        {/* Children */}
        {children.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {children.map(child => {
              const childIndent = (child.depth || 0) * 20;
              return (
                <div key={child.id} style={{ paddingLeft: `calc(0.5rem + ${childIndent}px)`, paddingTop: '0.4rem', paddingBottom: '0.4rem', paddingRight: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                  {child.depth > 0 && <div style={{ position: 'absolute', left: `calc(0.5rem + ${childIndent - 10}px)`, top: 0, bottom: 0, width: '2px', background: 'var(--border)' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                    <strong style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>{child.author_id}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{new Date(child.created_at).toLocaleTimeString().slice(0, 5)}</span>
                  </div>
                  {editingNote?.id === child.id ? (
                    <TweetEditor initialAst={child.content} initialPropsStr={child.properties} placeholder="Редактировать..." buttonText="Сохранить" onCancel={() => setEditingNote(null)} onSubmit={(ast, propsJson) => handleSubmitEdit(child.id, ast, propsJson)} autoFocus />
                  ) : (
                    <div style={{ fontSize: '13.5px', lineHeight: 1.45, color: 'var(--text-main)' }}>
                      <TiptapRender astString={child.content} onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [encrypt(newAst), child.id])} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <button type="button" onClick={() => setReplyingToId(child.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>💬</button>
                    <button type="button" onClick={() => setEditingNote(child)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>✏️</button>
                  </div>
                  {replyingToId === child.id && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <TweetEditor placeholder="Ответить..." buttonText="Отправить" onCancel={() => setReplyingToId(null)} onSubmit={(ast, propsJson) => handleSubmitReply(child.id, ast, propsJson)} autoFocus />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom action bar */}
        {replyingToId !== noteId && (
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: 'auto' }}>
            <button type="button" onClick={() => setReplyingToId(noteId)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>💬 Ответить</button>
            <button type="button" onClick={() => setEditingNote({ id: noteId })} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>✏️ Изменить</button>
          </div>
        )}
      </div>
    </div>
  );
};

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
  const { encrypt } = useCrypto();
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

  // ── Dynamic feed height ────────────────────────────────────────────
  const [feedHeight, setFeedHeight] = useState(600);
  useEffect(() => {
    const update = () => setFeedHeight(Math.max(300, window.innerHeight - 180));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
    getScrollElement: () => parentRef.current,
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
            el.style.background = 'rgba(234, 179, 8, 0.4)';
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
        <NoteModal noteId={expandedNoteId} onClose={() => setExpandedNoteId(null)} onNoteClick={(id) => { setExpandedNoteId(null); onNoteClick?.(id); }} />
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
              { label: '↩ Ответить', action: () => { onStartReply?.(contextMenu.noteId); closeContextMenu(); } },
              { label: '✏️ Редактировать', action: () => { const note = notes.find(n => n.id === contextMenu.noteId); if (note) onStartEdit?.(note); closeContextMenu(); } },
              { label: '⛶ Открыть', action: () => { setExpandedNoteId(contextMenu.noteId); closeContextMenu(); } },
              { label: collapsedIds.has(contextMenu.noteId) ? '▼ Развернуть' : '▲ Свернуть', action: () => { setCollapsedIds(prev => { const next = new Set(prev); next.has(contextMenu.noteId) ? next.delete(contextMenu.noteId) : next.add(contextMenu.noteId); return next; }); closeContextMenu(); } },
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
        <div ref={parentRef} className="feed-scroll-container" style={{ height: `${feedHeight}px`, overflowY: 'auto', paddingRight: '2px' }}>
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const note = visibleNotes[virtualItem.index];

              let props: any = {};
              try { props = JSON.parse(note.properties || '{}'); } catch { /* */ }

              const status = props.status || 'none';
              const type = props.type || 'tweet';
              const targetDate = props.date || '';

              const indent = Math.min(note.depth * 24, 240);
              const isReplying = replyingToId === note.id;
              const isDragOverChild = dragOverInfo?.id === note.id && dragOverInfo.zone === 'child';
              const isDragOverSibling = dragOverInfo?.id === note.id && dragOverInfo.zone === 'sibling';

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
                  onDragStart={(e) => { setDraggedId(note.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const zone = (e.clientX - rect.left) < rect.width / 2 ? 'sibling' : 'child';
                    if (dragOverInfo?.id !== note.id || dragOverInfo?.zone !== zone) setDragOverInfo({ id: note.id, zone });
                  }}
                  onDragLeave={() => setDragOverInfo(null)}
                  onDrop={(e) => { e.preventDefault(); if (dragOverInfo) handleDrop(note.id, dragOverInfo.zone); }}
                  onDragEnd={() => { setDraggedId(null); setDragOverInfo(null); }}
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
                      {editingNote?.id === note.id ? (
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
            })}
          </div>
        </div>
      )}
    </>
  );
};
