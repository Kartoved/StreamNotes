import React, { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotes } from '../db/hooks';
import { useDB } from '../db/DBContext';
import { TweetEditor, LexicalRender } from './TiptapEditor';

interface FeedProps {
  parentId?: string | null;
  onNoteClick?: (id: string) => void;
  replyingToId?: string | null;
  editingNote?: any | null;
  onStartReply?: (id: string) => void;
  onCancelReply?: () => void;
  onSubmitReply?: (parentId: string, text: string, propsJson: string) => void;
  onStartEdit?: (note: any) => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: (id: string, text: string, propsJson: string) => void;
}

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];
const TYPES = ['tweet', 'task', 'document'];

// Extract plain text from Lexical AST JSON for search
function extractPlainText(content: string): string {
  try {
    const ast = JSON.parse(content);
    const getText = (node: any): string => {
      if (node.type === 'text' || node.type === 'code-highlight') return node.text || '';
      const children = node.children || node.content || [];
      return children.map(getText).join(' ');
    };
    return getText(ast.root || ast);
  } catch {
    return content;
  }
}

// Extract #tags from note plain text
function extractTags(content: string): string[] {
  const text = extractPlainText(content);
  const matches = text.match(/#[\w\u0400-\u04ff][\w\u0400-\u04ff0-9_]*/gi) || [];
  return [...new Set(matches.map((t: string) => t.toLocaleLowerCase()))];
}

// ─── Backlinks Section ────────────────────────────────────────────────
const BacklinksSection = ({ noteId, onNoteClick }: { noteId: string; onNoteClick?: (id: string) => void }) => {
  const db = useDB();
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  React.useEffect(() => {
    (window as any).onNoteClick = onNoteClick;
  }, [onNoteClick]);

  React.useEffect(() => {
    if (!db || !noteId) return;
    db.execO(`SELECT id, content FROM notes WHERE content LIKE ?`, [`%note://${noteId}%`])
      .then(res => setBacklinks(res || []))
      .catch(() => setBacklinks([]));
  }, [db, noteId, isExpanded]);

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
                <LexicalRender astString={b.content} />
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
    if (row) setNote(row);
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
    setChildren(rows || []);
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
      [id, parentId, 'local-user', ast, now.toString(), propsJson, now, now]
    );
    setReplyingToId(null);
  };

  const handleSubmitEdit = async (id: string, ast: string, propsJson: string) => {
    await db.exec(`UPDATE notes SET content = ?, properties = ?, updated_at = ? WHERE id = ?`, [ast, propsJson, Date.now(), id]);
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
            <LexicalRender astString={note.content} onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [newAst, noteId])} />
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
                      <LexicalRender astString={child.content} onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [newAst, child.id])} />
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
  onNoteClick,
  replyingToId,
  editingNote,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
}: FeedProps) => {
  const db = useDB();
  const notes = useNotes(parentId);
  const parentRef = useRef<HTMLDivElement>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string; zone: 'sibling' | 'child' } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // ── Search & tags ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(n => extractTags(n.content).forEach(t => tagSet.add(t)));
    return [...tagSet].sort();
  }, [notes]);

  // ── Dynamic feed height ────────────────────────────────────────────
  const [feedHeight, setFeedHeight] = useState(600);
  useEffect(() => {
    const update = () => setFeedHeight(Math.max(300, window.innerHeight - 340));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Filter by search + tags ────────────────────────────────────────
  const filteredNotes = React.useMemo(() => {
    const q = searchQuery.toLocaleLowerCase().trim();
    const hasSearch = q.length > 0;
    const hasTags = selectedTags.size > 0;
    if (!hasSearch && !hasTags) return notes;

    const matchingIds = new Set<string>();
    for (const note of notes) {
      // Search in extracted plain text, not raw JSON
      const text = extractPlainText(note.content).toLocaleLowerCase();
      const searchOk = !hasSearch || text.includes(q);
      const tagOk = !hasTags || [...selectedTags].every(tag => text.includes(tag));
      if (searchOk && tagOk) matchingIds.add(note.id);
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
  }, [notes, searchQuery, selectedTags]);

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
    estimateSize: () => 80,
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
      await db.exec(`UPDATE notes SET properties = ? WHERE id = ?`, [JSON.stringify(props), id]);
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

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => { const next = new Set(prev); next.has(tag) ? next.delete(tag) : next.add(tag); return next; });
  };

  if (notes.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Пусто. Напиши что-нибудь первым!</div>;
  }

  return (
    <>
      {expandedNoteId && (
        <NoteModal noteId={expandedNoteId} onClose={() => setExpandedNoteId(null)} onNoteClick={(id) => { setExpandedNoteId(null); onNoteClick?.(id); }} />
      )}

      {/* Search + tags */}
      <div style={{ marginBottom: '8px' }}>
        <input type="search" className="search-bar" placeholder="🔍 Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
            {allTags.map(tag => (
              <span key={tag} className={`tag-pill${selectedTags.has(tag) ? ' active' : ''}`} onClick={() => toggleTag(tag)}>{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => { if (collapsedIds.size > 0) setCollapsedIds(new Set()); else setCollapsedIds(new Set(notes.map(n => n.id))); }}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
          {collapsedIds.size > 0 ? 'Развернуть всё' : 'Свернуть всё'}
        </button>
      </div>

      {filteredNotes.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Ничего не найдено</div>
      ) : (
        <div ref={parentRef} className="feed-scroll-container" style={{ height: `${feedHeight}px`, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '12px', paddingRight: '4px' }}>
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
                    padding: `0.35rem 0.6rem 0.35rem calc(0.6rem + ${indent}px)`,
                    borderBottom: isDragOverSibling ? '3px solid var(--accent)' : '1px solid var(--border)',
                    borderTop: '1px solid transparent',
                    outline: isDragOverChild ? '2px solid rgba(96,165,250,0.6)' : 'none',
                    outlineOffset: '-2px',
                    background: finalBg,
                    transition: 'background 0.1s',
                    opacity: draggedId === note.id ? 0.3 : 1,
                  }}
                >
                  {/* Vertical connector for nested notes */}
                  {note.depth > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: `calc(0.6rem + ${indent - 12}px)`,
                      top: '0.35rem', bottom: '-0.35rem',
                      width: '2px', background: 'var(--border)',
                    }} />
                  )}

                  {/* DnD zone overlay */}
                  {draggedId && draggedId !== note.id && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none', borderRadius: 'inherit', overflow: 'hidden', zIndex: 1 }}>
                      <div style={{ flex: 1, background: isDragOverSibling ? 'rgba(167,139,250,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isDragOverSibling && <span style={{ fontSize: '0.6rem', color: '#a78bfa', opacity: 0.8 }}>сиблинг</span>}
                      </div>
                      <div style={{ flex: 1, background: isDragOverChild ? 'rgba(96,165,250,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isDragOverChild && <span style={{ fontSize: '0.6rem', color: '#60a5fa', opacity: 0.8 }}>дочерний</span>}
                      </div>
                    </div>
                  )}

                  {/* ── Card body: left sidebar + right content ─────── */}
                  <div style={{ display: 'flex', gap: '8px', position: 'relative', zIndex: 2 }}>
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
                      {/* Top-right: expand + collapse buttons */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginBottom: '2px' }}>
                        <button onClick={(e) => { e.stopPropagation(); setExpandedNoteId(note.id); }} title="Раскрыть" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '0.62rem', padding: '1px 5px', cursor: 'pointer' }}>⛶</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setCollapsedIds(prev => { const next = new Set(prev); next.has(note.id) ? next.delete(note.id) : next.add(note.id); return next; }); }}
                          title="Свернуть/Развернуть"
                          style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '0.62rem', padding: '1px 5px', cursor: 'pointer' }}
                        >
                          {collapsedIds.has(note.id) ? '▼' : '▲'}
                        </button>
                      </div>

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
                            <LexicalRender
                              astString={note.content}
                              onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [newAst, note.id])}
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


                      {!editingNote && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          {!isReplying && (
                            <button type="button" title="Ответить" onClick={(e) => { e.stopPropagation(); onStartReply?.(note.id); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }}>💬</button>
                          )}
                          <button type="button" title="Изменить" onClick={(e) => { e.stopPropagation(); onStartEdit?.(note); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }}>✏️</button>
                        </div>
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
