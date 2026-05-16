import React from 'react';
import { NoteKind } from '../utils/noteKind';

interface KindChipProps {
  value: NoteKind;
  onChange: (next: NoteKind) => void;
}

const LABELS: Record<NoteKind, { color: string; bg: string; border: string }> = {
  note: {
    color: 'var(--text-sub)',
    bg: 'var(--bg-hover)',
    border: 'var(--line)',
  },
  task: {
    color: '#6095ed',
    bg: 'rgba(96, 149, 237, 0.12)',
    border: 'rgba(96, 149, 237, 0.30)',
  },
};

export function KindChip({ value, onChange }: KindChipProps) {
  const meta = LABELS[value];

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onClick={e => e.stopPropagation()}
    >
      <select
        value={value}
        onChange={e => onChange(e.target.value as NoteKind)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          background: meta.bg,
          color: meta.color,
          border: '1px solid ' + meta.border,
          borderRadius: '4px',
          padding: '1px 18px 1px 7px',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="task" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>✓ задача</option>
        <option value="note" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>📝 заметка</option>
      </select>
      <span style={{
        position: 'absolute', right: '4px', top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none', color: meta.color,
        fontSize: '0.6rem', opacity: 0.7,
      }}>▾</span>
    </div>
  );
}
