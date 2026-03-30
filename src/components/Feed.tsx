import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotes } from '../db/hooks';
import { useDB } from '../db/DBContext';
import { TweetEditor, LexicalRender } from './LexicalEditor';

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

const BacklinksSection = ({ noteId, onNoteClick }: { noteId: string, onNoteClick?: (id: string) => void }) => {
   const db = useDB();
   const [backlinks, setBacklinks] = useState<any[]>([]);
   const [isExpanded, setIsExpanded] = useState(false);

   React.useEffect(() => {
     (window as any).onNoteClick = onNoteClick;
   }, [onNoteClick]);

   React.useEffect(() => {
      if (!db || !noteId) return;
      db.execO(`SELECT id, content FROM notes WHERE content LIKE ?`, [`%note://${noteId}%`]).then(res => {
         setBacklinks(res || []);
      }).catch(e => {
         console.error(e);
         setBacklinks([]);
      });
   }, [db, noteId, isExpanded]); // Re-fetch on expand to be sure

   if (!backlinks || backlinks.length === 0) return null;

   return (
     <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
        <button 
           onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
           style={{ background: 'none', border: 'none', color: '#93c5fd', fontSize: '0.75rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
           🔗 {isExpanded ? '▼' : '▶'} Упомянуто в {backlinks.length} твитах
        </button>
        {isExpanded && (
           <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {backlinks.map(b => {
                 let text = '';
                 try {
                    const parsed = JSON.parse(b.content);
                    const extractAllText = (node: any): string => {
                      if (node.type === 'text') return node.text || '';
                      if (node.children) return node.children.map((c: any) => extractAllText(c)).join(' ');
                      return '';
                    };
                    text = extractAllText(parsed.root).trim();
                 } catch(e) {}
                 
                 if (!text) text = b.id;
                 if (text.length > 50) text = text.slice(0, 50) + '...';
                 
                 return (
                    <div 
                       key={b.id} 
                       onClick={(e) => { e.stopPropagation(); onNoteClick?.(b.id); }}
                       style={{ fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}
                    >
                       {text}
                    </div>
                 );
              })}
           </div>
        )}
     </div>
   );
};

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
  onSubmitEdit
}: FeedProps) => {
  const db = useDB();
  const notes = useNotes(parentId);
  const parentRef = useRef<HTMLDivElement>(null);
  
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{id: string, zone: 'top'|'center'|'bottom'} | null>(null);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [showProperties, setShowProperties] = useState(true);

  const visibleNotes = React.useMemo(() => {
     const result = [];
     let hidingDepth = -1;
     for (const note of notes) {
         if (hidingDepth !== -1) {
             if (note.depth <= hidingDepth) {
                 hidingDepth = -1; // End of hidden branch
             } else {
                 continue; // Skip descendant
             }
         }
         
         result.push(note);
         
         if (collapsedIds.has(note.id)) {
             hidingDepth = note.depth;
         }
     }
     return result;
  }, [notes, collapsedIds]);


  const virtualizer = useVirtualizer({
    count: visibleNotes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, // Увеличили из-за количества свойств
  });

  React.useEffect(() => {
    (window as any).scrollToNote = (id: string) => {
       const index = visibleNotes.findIndex(n => n.id === id);
       if (index !== -1) {
          virtualizer.scrollToIndex(index, { align: 'start' });
          // Highlight it briefly
          setTimeout(() => {
             const el = parentRef.current?.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
             if (el) {
                el.style.transition = 'background 0.5s';
                el.style.background = 'rgba(234, 179, 8, 0.4)';
                setTimeout(() => { el.style.background = ''; }, 1000);
             }
          }, 100);
       } else {
          // If the note is not visible (collapsed or not in feed), just focus it
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

  const handleDrop = async (targetId: string, zone: 'top'|'center'|'bottom') => {
    if (!draggedId || draggedId === targetId) return;
    
    // ПРОТЕКЦИЯ ОТ ЦИКЛОВ: Убедимся, что targetId не является потомком draggedId
    let isDescendant = false;
    let curr = targetId;
    while(curr) {
       const [row] = await db.execA(`SELECT parent_id FROM notes WHERE id = ?`, [curr]);
       if (!row) break;
       if (row[0] === draggedId) { isDescendant = true; break; }
       curr = row[0];
    }

    if (isDescendant) {
       alert("Архитектурная защита: Нельзя перетащить заметку внутрь самой себя или своего потомка!");
       setDraggedId(null);
       setDragOverInfo(null);
       return;
    }

    // Если zone === 'center', мы делаем ее дочерней для targetId
    if (zone === 'center') {
      await db.exec(`UPDATE notes SET parent_id = ? WHERE id = ?`, [targetId, draggedId]);
    } 
    // Если top/bottom — мы делаем ее сиблингом (перекидываем в тот же parent_id)
    else {
      const [targetRow] = await db.execA(`SELECT parent_id, sort_key FROM notes WHERE id = ?`, [targetId]);
      if (targetRow) {
         // Для полноценного сортирования Fractional Indexing нужен алгоритм перегенерации ключа. 
         // В MVP мы временно просто присваиваем его же parent_id и добавляем суффикс к sort_key (грязный хак, но рабочий для старта)
         const newSortKey = targetRow[1] + (zone === 'top' ? '0' : '9');
         await db.exec(`UPDATE notes SET parent_id = ?, sort_key = ? WHERE id = ?`, [targetRow[0], newSortKey, draggedId]);
      }
    }
    
    setDraggedId(null);
    setDragOverInfo(null);
  };

  if (notes.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Пусто. Напиши что-нибудь первым!</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', justifyContent: 'flex-end', width: '100%', maxWidth: '800px', margin: '0 auto 8px auto' }}>
          <button onClick={() => setShowProperties(!showProperties)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
              {showProperties ? 'Скрыть свойства' : 'Показать свойства'}
          </button>
          <button 
              onClick={() => {
                  if (collapsedIds.size > 0) setCollapsedIds(new Set());
                  else setCollapsedIds(new Set(notes.map(n => n.id)));
              }} 
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
              {collapsedIds.size > 0 ? 'Развернуть всё' : 'Свернуть всё'}
          </button>
      </div>
      <div 
        ref={parentRef} 
        style={{ 
          height: '600px', 
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          paddingRight: '4px',
          background: 'rgba(0,0,0,0.2)'
        }}
      >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const note = visibleNotes[virtualItem.index];
          let text = '';
          try { text = JSON.parse(note.content).text; } catch(e) { text = note.content; }
          
          let props: any = {};
          try { props = JSON.parse(note.properties || '{}'); } catch(e) {}
          
          const status = props.status || 'неразобранное';
          const type = props.type || 'tweet';
          const priority = props.priority || 'none';
          const targetDate = props.date || '';

          const indent = Math.min(note.depth * 28, 280);
          const isReplying = replyingToId === note.id;
          
          const isDragOverTop = dragOverInfo?.id === note.id && dragOverInfo.zone === 'top';
          const isDragOverCenter = dragOverInfo?.id === note.id && dragOverInfo.zone === 'center';
          const isDragOverBottom = dragOverInfo?.id === note.id && dragOverInfo.zone === 'bottom';

          let baseBg = 'rgba(255,255,255,0.02)';
          if (status === 'done') baseBg = 'rgba(34, 197, 94, 0.1)';
          else if (status === 'todo') baseBg = 'rgba(239, 68, 68, 0.15)';
          else if (status === 'doing') baseBg = 'rgba(59, 130, 246, 0.1)';
          else if (status === 'archived') baseBg = '#0f172a';

          let finalBg = isReplying ? 'rgba(167, 139, 250, 0.1)' : baseBg;
          if (isDragOverCenter) finalBg = 'rgba(96, 165, 250, 0.2)';

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              data-note-id={note.id}
              ref={virtualizer.measureElement}
              draggable
              onDragStart={(e) => {
                 setDraggedId(note.id);
                 e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                 e.preventDefault();
                 const rect = e.currentTarget.getBoundingClientRect();
                 const y = e.clientY - rect.top;
                 if (y < rect.height * 0.25) setDragOverInfo({ id: note.id, zone: 'top' });
                 else if (y > rect.height * 0.75) setDragOverInfo({ id: note.id, zone: 'bottom' });
                 else setDragOverInfo({ id: note.id, zone: 'center' });
              }}
              onDragLeave={() => setDragOverInfo(null)}
              onDrop={(e) => {
                 e.preventDefault();
                 if(dragOverInfo) handleDrop(note.id, dragOverInfo.zone);
              }}
              onDragEnd={() => {
                 setDraggedId(null);
                 setDragOverInfo(null);
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                padding: `1rem 1rem 1rem calc(1rem + ${indent}px)`, 
                borderBottom: isDragOverBottom ? '3px solid var(--accent)' : '1px solid transparent',
                borderTop: isDragOverTop ? '3px solid var(--accent)' : '1px solid transparent',
                background: finalBg,
                borderRadius: '8px',
                marginBottom: '8px',
                transition: 'background 0.2s',
                opacity: draggedId === note.id ? 0.3 : 1, 
                cursor: (editingNote?.id === note.id || isReplying) ? 'default' : 'pointer'
              }}
              onClick={() => {
                 if (!editingNote && !isReplying) onNoteClick?.(note.id);
              }}
            >
              {note.depth > 0 && (
                <div style={{
                  position: 'absolute',
                  left: `calc(1rem + ${indent - 14}px)`,
                  top: '1rem',
                  bottom: '-1rem',
                  width: '2px',
                  background: 'var(--border)'
                }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.8rem', gap: '8px', flexWrap: 'wrap' }}>
                <div 
                   onClick={(e) => { e.stopPropagation(); onNoteClick?.(note.id); }}
                   style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', cursor: 'pointer' }} 
                />
                <strong 
                  style={{ color: 'var(--text-main)', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onNoteClick?.(note.id); }}
                >
                   {note.author_id}
                </strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {new Date(note.created_at).toLocaleTimeString().slice(0, 5)}
                </span>
                
                <button 
                   onClick={(e) => { 
                      e.stopPropagation(); 
                      setCollapsedIds(prev => { 
                          const next = new Set(prev); 
                          if (next.has(note.id)) next.delete(note.id); else next.add(note.id);
                          return next;
                      }); 
                   }}
                   title="Свернуть/Развернуть ветку ответов"
                   style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '2px 6px', cursor: 'pointer', marginLeft: 'auto' }}
                >
                   {collapsedIds.has(note.id) ? '🔽 Развернуть тред' : '🔼 Свернуть'}
                </button>
              </div>

              {/* Панель мощных свойств! */}
              {showProperties && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                    <select 
                      value={type}
                      onChange={(e) => updateProperty(note.id, note.properties, 'type', e.target.value)}
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer' }}
                    >
                         {TYPES.map(s => <option key={s} value={s} style={{backgroundColor: '#1e293b', color: '#e2e8f0'}}>{s}</option>)}
                      </select>
  
                      <select 
                         value={status}
                         onChange={(e) => updateProperty(note.id, note.properties, 'status', e.target.value)}
                         style={{ background: 'rgba(255,255,255,0.05)', color: '#dcfce7', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer' }}
                      >
                         {STATUSES.map(s => <option key={s} value={s} style={{backgroundColor: '#1e293b', color: '#e2e8f0'}}>{s}</option>)}
                      </select>
  
                      <input 
                         type="date"
                         value={targetDate}
                         onChange={(e) => updateProperty(note.id, note.properties, 'date', e.target.value)}
                         style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer', colorScheme: 'dark' }}
                      />
                  </div>
              )}

              {/* Edit Mode vs View Mode */}
              {editingNote?.id === note.id ? (
                 <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }} onClick={(e:any) => e.stopPropagation()}>
                    <TweetEditor 
                       initialAst={note.content}
                       initialPropsStr={note.properties}
                       placeholder="Редактировать..."
                       buttonText="Сохранить"
                       onCancel={() => onCancelEdit && onCancelEdit()}
                       onSubmit={(ast, propsJson) => {
                          if (onSubmitEdit) onSubmitEdit(note.id, ast, propsJson);
                       }}
                       autoFocus={true}
                    />
                 </div>
              ) : (
                 <div className="note-content" style={{ marginTop: '0.5rem', fontSize: '15px', lineHeight: 1.5, color: '#e2e8f0' }} onClick={(e) => {
                    // Prevent navigating if clicking on interactive checkbox
                    if ((e.target as any).tagName?.toLowerCase() === 'input' || (e.target as HTMLElement).closest('[style*="border-color"]')) {
                        return; // Handle in LexicalRender
                    }
                 }}>
                   <LexicalRender 
                      astString={note.content} 
                      onUpdateAST={(newAst) => {
                         // Interactive Checkbox updating DB!
                         db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [newAst, note.id]);
                      }} 
                   />
                   {/* Render Backlinks */}
                   <BacklinksSection noteId={note.id} onNoteClick={onNoteClick} />
                 </div>
              )}

              {/* Actions */}
              <div className="note-actions" style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', color: '#718096', fontSize: '13px' }}>
                 {!isReplying && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); if (onStartReply) onStartReply(note.id); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                       💬 Ответить
                    </button>
                 )}
                 {!editingNote && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); if (onStartEdit) onStartEdit(note); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                       ✏️ Изменить
                    </button>
                 )}
              </div>

              {isReplying && (
                 <div style={{ marginTop: '1rem' }}>
                    <TweetEditor 
                       placeholder="Напиши ответ..."
                       buttonText="Отправить"
                       onCancel={() => onCancelReply && onCancelReply()}
                       onSubmit={(ast, propsJson) => {
                          if (onSubmitReply) onSubmitReply(note.id, ast, propsJson);
                       }}
                       autoFocus={true}
                    />
                 </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
};
