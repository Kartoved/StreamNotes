import React, { useState } from 'react';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { TiptapRender } from '../editor/TiptapViewer';

export const BacklinksSection = ({ noteId, onNoteClick }: { noteId: string; onNoteClick?: (id: string) => void }) => {
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
