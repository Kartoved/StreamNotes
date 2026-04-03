import React, { useState, useEffect, useCallback } from 'react';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';
import { PropChip, DateChip } from './NoteCard';

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];
const TYPES = ['tweet', 'task', 'document'];

export const NoteModal = ({ noteId, onClose, onNoteClick }: { noteId: string; onClose: () => void; onNoteClick?: (id: string) => void }) => {
  const db = useDB();
  const { encrypt, decrypt } = useCrypto();
  const [note, setNote] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!db) return;
    const [row] = await db.execO(`SELECT * FROM notes WHERE id = ?`, [noteId]);
    if (row) {
      setNote({
        ...(row as any),
        content: (row as any).content, // remains encrypted until render or handled by TiptapRender/Editor
        properties: (row as any).properties
      });
    }
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
    setChildren((rows || []).map((r: any) => ({ ...r })));
  }, [db, noteId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!db) return; return db.onUpdate(() => load()); }, [db, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!note) return null;

  let props: any = {};
  try {
    const raw = decrypt(note.properties) || '{}';
    props = JSON.parse(raw);
  } catch { /* */ }

  const handleUpdateProps = async (id: string, newProps: any) => {
    const json = JSON.stringify(newProps);
    await db.exec(`UPDATE notes SET properties = ?, updated_at = ? WHERE id = ?`, [encrypt(json), Date.now(), id]);
  };

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
    setEditingNoteId(null);
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '2rem'
  };

  const modalStyle: React.CSSProperties = {
    width: '100%', maxWidth: '800px', maxHeight: '90vh',
    background: 'var(--bg)', border: '1px solid var(--line)',
    borderRadius: '16px', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden'
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        
        {/* Header toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-sub)' }}>{note.author_id}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{new Date(note.created_at).toLocaleString()}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button onClick={() => { onNoteClick?.(noteId); onClose(); }} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--text-sub)', borderRadius: '6px', padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Открыть в ленте</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '1.2rem', cursor: 'pointer', padding: '0 5px' }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          
          {/* Main Note */}
          <div style={{ marginBottom: '32px' }}>
            {editingNoteId === noteId ? (
              <TweetEditor placeholder="Редактировать..." initialAst={decrypt(note.content)} initialPropsStr={decrypt(note.properties)} buttonText="Сохранить" onCancel={() => setEditingNoteId(null)} onSubmit={(ast, pr) => handleSubmitEdit(noteId, ast, pr)} autoFocus />
            ) : (
              <>
                <div style={{ fontSize: '1.1rem', lineHeight: 1.6, color: 'var(--text)', marginBottom: '16px' }}>
                  <TiptapRender astString={decrypt(note.content)} onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [encrypt(newAst), noteId])} />
                </div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <PropChip value={props.type || 'tweet'} options={TYPES} onChange={v => handleUpdateProps(noteId, { ...props, type: v })} />
                  <PropChip value={props.status || 'none'} options={STATUSES} onChange={v => handleUpdateProps(noteId, { ...props, status: v })} />
                  <DateChip value={props.date || ''} onChange={v => handleUpdateProps(noteId, { ...props, date: v })} />
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                    <button onClick={() => setReplyingToId(noteId)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>💬 Ответить</button>
                    <button onClick={() => setEditingNoteId(noteId)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>✏️ Изменить</button>
                  </div>
                </div>
              </>
            )}

            {replyingToId === noteId && (
              <div style={{ marginTop: '20px' }}>
                <TweetEditor placeholder="Написать ответ..." buttonText="Отправить" onCancel={() => setReplyingToId(null)} onSubmit={(ast, pr) => handleSubmitReply(noteId, ast, pr)} autoFocus />
              </div>
            )}
          </div>

          {/* Children / Replies */}
          {children.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
              {children.map(child => {
                const cProps = JSON.parse(decrypt(child.properties) || '{}');
                const indent = (child.depth || 0) * 24;
                return (
                  <div key={child.id} style={{ 
                    paddingLeft: indent, 
                    paddingTop: '16px', 
                    paddingBottom: '16px', 
                    borderTop: '1px solid var(--line)',
                    position: 'relative'
                  }}>
                    {child.depth > 0 && <div style={{ position: 'absolute', left: indent - 12, top: 0, bottom: 0, width: '1px', background: 'var(--line)' }} />}
                    
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-sub)' }}>{child.author_id}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{new Date(child.created_at).toLocaleTimeString().slice(0, 5)}</span>
                    </div>

                    {editingNoteId === child.id ? (
                      <TweetEditor placeholder="Редактировать..." initialAst={decrypt(child.content)} initialPropsStr={decrypt(child.properties)} buttonText="Сохранить" onCancel={() => setEditingNoteId(null)} onSubmit={(ast, pr) => handleSubmitEdit(child.id, ast, pr)} autoFocus />
                    ) : (
                      <>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--text)', marginBottom: '10px' }}>
                          <TiptapRender astString={decrypt(child.content)} onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [encrypt(newAst), child.id])} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {cProps.status && cProps.status !== 'none' && <PropChip value={cProps.status} options={STATUSES} onChange={v => handleUpdateProps(child.id, { ...cProps, status: v })} />}
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                            <button onClick={() => setReplyingToId(child.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '0.75rem', cursor: 'pointer' }}>💬</button>
                            <button onClick={() => setEditingNoteId(child.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '0.75rem', cursor: 'pointer' }}>✏️</button>
                          </div>
                        </div>
                      </>
                    )}

                    {replyingToId === child.id && (
                      <div style={{ marginTop: '12px' }}>
                        <TweetEditor placeholder="Ответить..." buttonText="Отправить" onCancel={() => setReplyingToId(null)} onSubmit={(ast, pr) => handleSubmitReply(child.id, ast, pr)} autoFocus />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
