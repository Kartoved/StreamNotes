import React from 'react';
import { NoteKind } from '../utils/noteKind';

interface KindChipProps {
  value: NoteKind | undefined;          // undefined = inbox
  onChange: (next: NoteKind | undefined) => void;
  // Compact rendering hides the inbox option and renders inline as a button
  // (used on cards where we only want to nudge classification).
  inboxOnly?: boolean;
}

const LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  inbox: {
    label: '📥 разобрать',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.10)',
    border: 'rgba(245, 158, 11, 0.30)',
  },
  note: {
    label: '📝 заметка',
    color: 'var(--text-sub)',
    bg: 'var(--bg-hover)',
    border: 'var(--line)',
  },
  task: {
    label: '✓ задача',
    color: '#6095ed',
    bg: 'rgba(96, 149, 237, 0.12)',
    border: 'rgba(96, 149, 237, 0.30)',
  },
};

export function KindChip({ value, onChange }: KindChipProps) {
  const key = value ?? 'inbox';
  const meta = LABELS[key];

  const onSel = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === 'inbox') onChange(undefined);
    else onChange(v as NoteKind);
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onClick={e => e.stopPropagation()}
    >
      <select
        value={key}
        onChange={onSel}
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
        <option value="inbox" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>📥 разобрать</option>
        <option value="note"  style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>📝 заметка</option>
        <option value="task"  style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>✓ задача</option>
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
