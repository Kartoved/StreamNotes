import React, { useState, useEffect, useRef } from 'react';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';

export interface NoteOption {
  id: string;
  title: string;
}

interface Props {
  query: string;
  position: { top: number; left: number };
  onSelect: (note: NoteOption) => void;
  onCreateNew: (title: string) => void;
  onClose: () => void;
  keyHandlerRef?: React.MutableRefObject<((e: KeyboardEvent) => boolean) | null>;
}

function extractText(node: any): string {
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map((c: any) => extractText(c)).join(' ');
}

export const BacklinkDropdown: React.FC<Props> = ({ query, position, onSelect, onCreateNew, onClose, keyHandlerRef }) => {
  const db = useDB();
  const { decrypt, decryptForFeed } = useCrypto();
  const cryptoRef = useRef({ decrypt, decryptForFeed });
  useEffect(() => { cryptoRef.current = { decrypt, decryptForFeed }; }, [decrypt, decryptForFeed]);

  const [results, setResults] = useState<NoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Reload on every query change — mirrors original working implementation
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    db.execO(`SELECT id, content, feed_id FROM notes WHERE is_deleted = 0 LIMIT 200`, [])
      .then((rows: any[]) => {
        if (cancelled) return;
        const { decrypt: dec, decryptForFeed: decFeed } = cryptoRef.current;
        const mapped = (rows as any[]).map(r => {
          let title = '';
          try {
            const plaintext = r.feed_id ? decFeed(r.content, r.feed_id) : dec(r.content);
            const doc = JSON.parse(plaintext);
            title = extractText(doc).trim();
          } catch {
            title = r.id;
          }
          return { id: r.id, title: title.slice(0, 80) || r.id };
        });
        const filtered = mapped.filter(r =>
          !query || r.title.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filtered.slice(0, 15));
        setSelectedIdx(0);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query, db]);

  const showCreate = query.length > 0 && !results.some(r => r.title.toLowerCase() === query.toLowerCase());
  const totalItems = results.length + (showCreate ? 1 : 0);

  // Keyboard navigation — handler forwarded via ref to the Suggestion plugin's onKeyDown
  if (keyHandlerRef) {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, totalItems - 1));
        return true;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        return true;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (showCreate && selectedIdx === results.length) {
          onCreateNew(query);
        } else if (results[selectedIdx]) {
          onSelect(results[selectedIdx]);
        }
        return true;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return true;
      }
      return false;
    };
  }

  useEffect(() => {
    return () => { if (keyHandlerRef) keyHandlerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const itemStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 14px',
    cursor: 'pointer',
    background: active ? 'var(--bg-active)' : 'transparent',
    borderBottom: '1px solid var(--line)',
    transition: '0.1s background',
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        background: 'var(--bg)',
        border: '1px solid var(--line-strong)',
        borderRadius: 'var(--radius-lg)',
        zIndex: 10000,
        minWidth: '280px',
        boxShadow: 'var(--shadow-lg, 0 4px 20px rgba(0,0,0,0.15))',
        overflow: 'hidden',
        maxHeight: '280px',
        overflowY: 'auto',
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {loading ? (
        <div style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-faint)', fontFamily: 'var(--font-body)' }}>
          Загрузка...
        </div>
      ) : results.length === 0 && !showCreate ? (
        <div style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-faint)', fontFamily: 'var(--font-body)' }}>
          Заметок не найдено
        </div>
      ) : (
        <>
          {results.map((r, i) => (
            <div
              key={r.id}
              onClick={() => onSelect(r)}
              onMouseEnter={() => setSelectedIdx(i)}
              style={itemStyle(i === selectedIdx)}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', marginBottom: '2px', fontFamily: 'var(--font-mono)' }}>{r.id}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{r.title}</div>
            </div>
          ))}
          {showCreate && (
            <div
              onClick={() => onCreateNew(query)}
              onMouseEnter={() => setSelectedIdx(results.length)}
              style={{ ...itemStyle(selectedIdx === results.length), color: 'var(--accent, #3b82f6)', fontStyle: 'italic', fontSize: '0.85rem', fontFamily: 'var(--font-body)' }}
            >
              + Создать «{query}»
            </div>
          )}
        </>
      )}
    </div>
  );
};
