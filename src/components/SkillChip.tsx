import React, { useEffect, useRef, useState } from 'react';

export interface NoteSkill {
  name: string;
  xp: number;
}

export const DEFAULT_SKILL_XP = 10;

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface SkillChipProps {
  value?: NoteSkill;
  onChange: (next: NoteSkill | undefined) => void;
  existingNames: string[];
}

export function SkillChip({ value, onChange, existingNames }: SkillChipProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(value?.name || '');
  const [xp, setXp] = useState<number>(value?.xp ?? DEFAULT_SKILL_XP);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Sync local state when external value changes (other device, re-open card).
  useEffect(() => {
    setName(value?.name || '');
    setXp(value?.xp ?? DEFAULT_SKILL_XP);
  }, [value?.name, value?.xp]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = () => {
    const norm = normalizeName(name);
    if (!norm) {
      onChange(undefined);
    } else {
      const safeXp = Number.isFinite(xp) && xp >= 0 ? Math.floor(xp) : DEFAULT_SKILL_XP;
      onChange({ name: norm, xp: safeXp });
    }
    setOpen(false);
  };

  const clear = () => {
    onChange(undefined);
    setName('');
    setXp(DEFAULT_SKILL_XP);
    setOpen(false);
  };

  const has = !!value?.name;
  const label = has ? `🎯 ${value!.name} · ${value!.xp}xp` : '🎯 skill';

  // Suggestions: existing names filtered by current input, excluding exact match.
  const norm = normalizeName(name);
  const suggestions = existingNames
    .filter(n => n !== norm && (norm === '' || n.includes(norm)))
    .slice(0, 6);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        title={has ? `Навык: ${value!.name} (+${value!.xp} XP при выполнении)` : 'Привязать навык'}
        style={{
          background: has ? 'rgba(189, 147, 249, 0.12)' : 'var(--bg-hover)',
          color: has ? '#bd93f9' : 'var(--text-faint)',
          borderRadius: '4px',
          padding: '1px 7px',
          fontSize: '0.7rem',
          border: '1px solid ' + (has ? 'rgba(189, 147, 249, 0.3)' : 'var(--line)'),
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          userSelect: 'none',
          outline: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>

      {open && (
        <div
          ref={popoverRef}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 1500,
            background: 'var(--bg)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius)',
            padding: '8px',
            minWidth: '220px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              type="text"
              placeholder="имя навыка"
              value={name}
              onChange={e => setName(e.target.value.toLowerCase())}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setOpen(false);
              }}
              style={{
                flex: 1,
                background: 'var(--bg-hover)',
                border: '1px solid var(--line)',
                borderRadius: '4px',
                padding: '4px 7px',
                fontSize: '0.78rem',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <input
              type="number"
              min={0}
              value={xp}
              onChange={e => setXp(parseInt(e.target.value) || 0)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setOpen(false);
              }}
              style={{
                width: '64px',
                background: 'var(--bg-hover)',
                border: '1px solid var(--line)',
                borderRadius: '4px',
                padding: '4px 7px',
                fontSize: '0.78rem',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setName(s)}
                  style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--line)',
                    borderRadius: '4px',
                    padding: '2px 7px',
                    fontSize: '0.7rem',
                    color: 'var(--text-sub)',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <button
              type="button"
              onClick={clear}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-faint)',
                fontSize: '0.7rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                padding: '2px 4px',
              }}
            >
              Убрать
            </button>
            <button
              type="button"
              onClick={commit}
              style={{
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                fontSize: '0.72rem',
                padding: '3px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
