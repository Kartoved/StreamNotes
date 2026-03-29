import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotes } from '../db/hooks';

interface FeedProps {
  parentId?: string | null;
  onNoteClick?: (id: string) => void;
  // Инлайн-состояния
  replyingToId?: string | null;
  onStartReply?: (id: string) => void;
  onCancelReply?: () => void;
  onSubmitReply?: (parentId: string, text: string) => void;
}

export const Feed: React.FC<FeedProps> = ({ 
   parentId = null, 
   onNoteClick, 
   replyingToId, 
   onStartReply, 
   onCancelReply, 
   onSubmitReply 
}) => {
  const notes = useNotes(parentId);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Динамически пересчитается после первого рендера
  });

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
          try {
             text = JSON.parse(note.content).text;
          } catch(e) { text = note.content; }

          const indent = Math.min(note.depth * 28, 280);
          const isReplying = replyingToId === note.id;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement} // Магия! TanStack Virtualizer сам заметит, если форма изменит высоту
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                padding: `1rem 1rem 1rem calc(1rem + ${indent}px)`, 
                borderBottom: '1px solid var(--border)',
                background: isReplying ? 'rgba(167, 139, 250, 0.05)' : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              {/* Полоска ветки */}
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

              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', marginRight: '0.75rem' }} />
                <strong style={{ color: 'var(--text-main)' }}>{note.author_id}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '1rem' }}>
                    {new Date(note.created_at).toLocaleTimeString().slice(0, 5)}
                </span>
                
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
                  <button 
                    onClick={() => onStartReply && onStartReply(note.id)}
                    style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
                  >
                    Ответить 💬
                  </button>
                  <button 
                    onClick={() => onNoteClick && onNoteClick(note.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
                  >
                    В фокус 🔍
                  </button>
                </div>
              </div>

              <div style={{ lineHeight: 1.5, color: '#e2e8f0', cursor: 'text' }}>
                {text}
              </div>

              {/* Вот тут наша магия инлайн-ввода! Появляется прямо под твитом */}
              {isReplying && (
                 <form 
                    style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}
                    onSubmit={(e) => {
                       e.preventDefault();
                       const input = e.currentTarget.elements.namedItem('replyText') as HTMLInputElement;
                       if (input.value.trim() && onSubmitReply) {
                          onSubmitReply(note.id, input.value.trim()); // Передаем parentId этого узла инсертеру
                       }
                    }}
                 >
                    <input 
                       name="replyText"
                       autoFocus // Автоматический фокус без мышки
                       placeholder="Напиши ответ..."
                       style={{
                         flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', 
                         background: 'rgba(0,0,0,0.5)', border: '1px solid #a78bfa',
                         color: 'white', outline: 'none'
                       }}
                    />
                    <button 
                       type="submit"
                       style={{ background: '#a78bfa', border: 'none', color: 'white', padding: '0 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >Обновить ленту</button>
                    <button 
                       type="button"
                       onClick={() => onCancelReply && onCancelReply()}
                       style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '0 1rem', borderRadius: '6px', cursor: 'pointer' }}
                    >Отмена</button>
                 </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
