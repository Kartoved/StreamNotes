import React, { useState } from 'react';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';

export const NoteModal = ({ noteId, onClose, onNoteClick }: { noteId: string; onClose: () => void; onNoteClick?: (id: string) => void }) => {
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
  }, [db, noteId, decrypt]);

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
