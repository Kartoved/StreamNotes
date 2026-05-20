import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownPosition } from './useDropdownPosition';

interface Props {
  query: string;
  position: { top: number; left: number };
  onSelect: (tag: string) => void;
  onClose: () => void;
  keyHandlerRef?: React.MutableRefObject<((e: KeyboardEvent) => boolean) | null>;
}

export const HashtagDropdown: React.FC<Props> = ({ query, position, onSelect, onClose, keyHandlerRef }) => {
  const allTags: string[] = (window as any).__feedAllTags ?? [];
  const [selectedIdx, setSelectedIdx] = useState(0);

  const q = query.toLowerCase().replace(/^#/, '');
  const filtered = allTags
    .filter(t => !q || t.replace(/^#/, '').includes(q))
    .slice(0, 8);
  const isNew = q.length > 0 && !allTags.some(t => t.replace(/^#/, '') === q);
  const total = filtered.length + (isNew ? 1 : 0);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  if (keyHandlerRef) {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, total - 1)); return true; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return true; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isNew && selectedIdx === filtered.length) { onSelect('#' + q); return true; }
        if (filtered[selectedIdx]) { onSelect(filtered[selectedIdx]); return true; }
        return false;
      }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return true; }
      return false;
    };
  }

  useEffect(() => () => { if (keyHandlerRef) keyHandlerRef.current = null; }, []); // eslint-disable-line

  // Auto-flip above trigger if dropdown would overflow visualViewport
  // (mobile keyboard open). Hook must be called before the early-return.
  const showHint = total === 0 && q.length === 0; // typed # but no tags yet
  const rootRef = useRef<HTMLDivElement>(null);
  const adjusted = useDropdownPosition(position, rootRef, [total, showHint]);

  if (total === 0 && !showHint) return null;

  const row = (active: boolean): React.CSSProperties => ({
    padding: '7px 12px', cursor: 'pointer',
    background: active ? 'var(--bg-hover)' : 'transparent',
    fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
    transition: 'background 0.1s',
  });

  // Portal to <body> so position: fixed is relative to the viewport, not
  // some transformed ancestor (e.g. the feed virtualizer wraps each item
  // in a transform: translateY(...), which becomes the containing block
  // for fixed descendants and pushes the dropdown off-screen).
  return createPortal((
    <div
      ref={rootRef}
      className="sn-portal-dropdown"
      style={{
        position: 'fixed', top: adjusted.top, left: adjusted.left,
        background: 'var(--bg)', border: '1px solid var(--line-strong)',
        borderRadius: 'var(--radius-lg)', zIndex: 10000,
        minWidth: 'min(160px, calc(100vw - 24px))',
        maxWidth: 'min(260px, calc(100vw - 24px))',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        maxHeight: 'min(240px, calc(100dvh - 24px))',
        overflowY: 'auto',
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {filtered.map((tag, i) => (
        <div
          key={tag}
          onClick={() => onSelect(tag)}
          onMouseEnter={() => setSelectedIdx(i)}
          style={{ ...row(i === selectedIdx), color: 'var(--accent)' }}
        >{tag}</div>
      ))}
      {isNew && (
        <div
          onClick={() => onSelect('#' + q)}
          onMouseEnter={() => setSelectedIdx(filtered.length)}
          style={{ ...row(selectedIdx === filtered.length), color: 'var(--text-faint)', fontStyle: 'italic' }}
        >+ #{q}</div>
      )}
      {showHint && (
        <div style={{ padding: '7px 12px', fontSize: '0.78rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          введи название тега
        </div>
      )}
    </div>
  ), document.body);
};
