import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotes } from '../db/hooks';
import { useDB } from '../db/DBContext';

interface FeedProps {
  parentId?: string | null;
  onNoteClick?: (id: string) => void;
  replyingToId?: string | null;
  onStartReply?: (id: string) => void;
  onCancelReply?: () => void;
  onSubmitReply?: (parentId: string, text: string) => void;
}

const STATUSES = ['неразобранное', 'todo', 'doing', 'done', 'cancelled', 'archived'];
const TYPES = ['tweet', 'task', 'document'];
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];

export const Feed: React.FC<FeedProps> = ({ 
   parentId = null, 
   onNoteClick, 
   replyingToId, 
   onStartReply, 
   onCancelReply, 
   onSubmitReply 
}) => {
  const db = useDB();
  const notes = useNotes(parentId);
  const parentRef = useRef<HTMLDivElement>(null);
  
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // Используем enum для отображения сложных зон бросания: sibling_before, child, sibling_after
  const [dragOverInfo, setDragOverInfo] = useState<{id: string, zone: 'top'|'center'|'bottom'} | null>(null);

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, // Увеличили из-за количества свойств
  });

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
          const note = notes[virtualItem.index];
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

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              draggable
              onDragStart={(e) => {
                 setDraggedId(note.id);
                 e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                 e.preventDefault();
                 // Вычисляем где находится мышка внутри элемента, чтобы разделить на 3 зоны
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
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                padding: `1rem 1rem 1rem calc(1rem + ${indent}px)`, 
                borderBottom: isDragOverBottom ? '3px solid var(--accent)' : '1px solid var(--border)',
                borderTop: isDragOverTop ? '3px solid var(--accent)' : 'none',
                background: isReplying ? 'rgba(167, 139, 250, 0.05)' : (isDragOverCenter ? 'rgba(96, 165, 250, 0.1)' : 'transparent'),
                transition: 'background 0.2s',
                opacity: draggedId === note.id ? 0.3 : 1, 
                cursor: 'grab'
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
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)' }} />
                <strong style={{ color: 'var(--text-main)', cursor: 'pointer' }}>{note.author_id}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {new Date(note.created_at).toLocaleTimeString().slice(0, 5)}
                </span>
                
                {/* Панель мощных свойств! */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select 
                       value={type}
                       onChange={(e) => updateProperty(note.id, note.properties, 'type', e.target.value)}
                       style={{ background: 'rgba(255,255,255,0.05)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer' }}
                    >
                       {TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select 
                       value={status}
                       onChange={(e) => updateProperty(note.id, note.properties, 'status', e.target.value)}
                       style={{ background: 'rgba(255,255,255,0.05)', color: '#dcfce7', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer' }}
                    >
                       {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select 
                       value={priority}
                       onChange={(e) => updateProperty(note.id, note.properties, 'priority', e.target.value)}
                       style={{ background: 'rgba(255,255,255,0.05)', color: priority === 'urgent' ? '#fca5a5' : '#fde047', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer' }}
                    >
                       {PRIORITIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <input 
                       type="date"
                       value={targetDate}
                       onChange={(e) => updateProperty(note.id, note.properties, 'date', e.target.value)}
                       style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer', colorScheme: 'dark' }}
                    />
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button onClick={() => onStartReply && onStartReply(note.id)} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: '1rem', cursor: 'pointer', padding: '0 0.5rem' }}>💬</button>
                  <button onClick={() => onNoteClick && onNoteClick(note.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1rem', cursor: 'pointer', padding: '0' }}>🔍</button>
                </div>
              </div>

              <div style={{ lineHeight: 1.5, color: '#e2e8f0', cursor: 'text' }}>
                {text}
              </div>

              {isReplying && (
                 <form 
                    style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}
                    onSubmit={(e) => {
                       e.preventDefault();
                       const input = e.currentTarget.elements.namedItem('replyText') as HTMLInputElement;
                       if (input.value.trim() && onSubmitReply) onSubmitReply(note.id, input.value.trim());
                    }}
                 >
                    <input 
                       name="replyText" autoFocus placeholder="Напиши ответ..."
                       style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid #a78bfa', color: 'white', outline: 'none' }}
                    />
                    <button type="submit" style={{ background: '#a78bfa', border: 'none', color: 'white', padding: '0 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Отправить</button>
                    <button type="button" onClick={() => onCancelReply && onCancelReply()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '0 1rem', borderRadius: '6px', cursor: 'pointer' }}>Отмена</button>
                 </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
