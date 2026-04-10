import React, { useState, useEffect, useCallback } from 'react';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { TweetEditor } from './TiptapEditor';

export const NoteModal = ({ noteId, onClose }: { noteId: string; onClose: () => void }) => {
  const db = useDB();
  const { encrypt, decrypt, decryptForFeed, encryptForFeed } = useCrypto();
  const [note, setNote] = useState<any>(null);

  const load = useCallback(async () => {
    const [row] = await db.execO(`SELECT * FROM notes WHERE id = ?`, [noteId]);
    if (row) setNote(row);
  }, [db, noteId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => db.onUpdate(() => load()), [db, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!note) return null;

  const feedId: string | null = note.feed_id ?? null;
  const dec = (s: string) => feedId ? decryptForFeed(s, feedId) : decrypt(s);
  const enc = (s: string) => feedId ? encryptForFeed(s, feedId) : encrypt(s);

  const handleSubmitEdit = async (ast: string, propsJson: string) => {
    await db.exec(
      `UPDATE notes SET content = ?, properties = ?, updated_at = ? WHERE id = ?`,
      [enc(ast), enc(propsJson), Date.now(), noteId]
    );
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div onClick={e => e.stopPropagation()} style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
        <TweetEditor
          placeholder="Редактировать..."
          initialAst={dec(note.content)}
          initialPropsStr={dec(note.properties)}
          buttonText="Сохранить"
          onCancel={onClose}
          onSubmit={handleSubmitEdit}
          autoFocus
          zenMode={true}
        />
      </div>
    </div>
  );
};
