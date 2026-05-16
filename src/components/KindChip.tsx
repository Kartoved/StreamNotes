import React from 'react';
import { NoteKind } from '../utils/noteKind';
import { IconCheck, IconNote, IconChevronDown } from './icons';
import { CHIP_SELECT, CHIP_ACTIVE } from './chipStyle';

interface KindChipProps {
  value: NoteKind;
  onChange: (next: NoteKind) => void;
}

const TASK_STYLE = CHIP_ACTIVE('#6095ed', 'rgba(96, 149, 237, 0.12)', 'rgba(96, 149, 237, 0.30)');
const NOTE_STYLE = { ...CHIP_SELECT, color: 'var(--text-sub)' };

export function KindChip({ value, onChange }: KindChipProps) {
  const active = value === 'task';
  const style: React.CSSProperties = {
    ...(active ? TASK_STYLE : NOTE_STYLE),
    paddingRight: '18px',
    cursor: 'pointer',
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Leading icon (rendered atop the select since the select can't host JSX) */}
      <span style={{
        position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: active ? '#6095ed' : 'var(--text-sub)',
        display: 'flex',
      }}>
        {active ? <IconCheck size={11} /> : <IconNote size={11} />}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as NoteKind)}
        style={{ ...style, paddingLeft: '22px' }}
      >
        <option value="task" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>задача</option>
        <option value="note" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>заметка</option>
      </select>
      <span style={{
        position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: active ? '#6095ed' : 'var(--text-faint)',
        display: 'flex', opacity: 0.7,
      }}>
        <IconChevronDown size={10} />
      </span>
    </div>
  );
}
