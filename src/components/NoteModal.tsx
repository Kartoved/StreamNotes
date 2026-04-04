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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(noteId);

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
    position: 'fixed', inset: 0, zIndex: 3000,
    background: 'var(--bg)',
    display: 'flex', flexDirection: 'column',
  };

  const modalStyle: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column',
    width: '100%', height: '100%', overflow: 'hidden'
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        
        {/* Header toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid var(--line)', background: 'var(--bg)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-sub)' }}>{note.author_id}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{new Date(note.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          <TweetEditor 
            placeholder="Редактировать..." 
            initialAst={decrypt(note.content)} 
            initialPropsStr={decrypt(note.properties)} 
            buttonText="Сохранить" 
            onCancel={onClose} 
            onSubmit={(ast, pr) => { handleSubmitEdit(noteId, ast, pr); onClose(); }} 
            autoFocus 
            zenMode={true}
          />
        </div>
      </div>
    </div>
  );
};
