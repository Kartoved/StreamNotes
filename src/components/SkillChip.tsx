import React, { useEffect, useRef, useState } from 'react';
import { IconTarget } from './icons';
import { CHIP_BASE, CHIP_ACTIVE } from './chipStyle';

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

type PopPos = { top?: number; bottom?: number; left?: number; right?: number };

function computePopPos(btn: HTMLElement, popH = 180, popW = 220): PopPos {
  const btnRect = btn.getBoundingClientRect();
  const vv = window.visualViewport;
  const vbottom = (vv?.offsetTop  ?? 0) + (vv?.height ?? window.innerHeight);
  const vright  = (vv?.offsetLeft ?? 0) + (vv?.width  ?? window.innerWidth);
  const flipUp   = btnRect.bottom + popH + 8 > vbottom;
  const flipLeft = btnRect.left   + popW + 8 > vright;
  return {
    ...(flipUp   ? { bottom: window.innerHeight - btnRect.top  + 4 } : { top: btnRect.bottom + 4 }),
    ...(flipLeft ? { right:  window.innerWidth  - btnRect.right    } : { left: btnRect.left  }),
  };
}

export function SkillChip({ value, onChange, existingNames }: SkillChipProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(value?.name || '');
  const [xp, setXp] = useState<number>(value?.xp ?? DEFAULT_SKILL_XP);
  const [popPos, setPopPos] = useState<PopPos>({ top: 0, left: 0 });
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

  // Re-measure after the popover is in the DOM (now we know its real size)
  // and on viewport changes (scroll, resize, mobile keyboard).
  React.useLayoutEffect(() => {
    if (!open) return;

    const reposition = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const pop = popoverRef.current;
      setPopPos(computePopPos(btn, pop?.offsetHeight, pop?.offsetWidth));
    };

    reposition();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', reposition);
    vv?.addEventListener('scroll', reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      vv?.removeEventListener('resize', reposition);
      vv?.removeEventListener('scroll', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Toggle: when opening, compute coords synchronously from the click so the
  // popover is already at the right place on its very first paint.
  const toggle = () => {
    setOpen(prev => {
      if (!prev && buttonRef.current) {
        setPopPos(computePopPos(buttonRef.current));
      }
      return !prev;
    });
  };

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
  const chipStyle = has
    ? CHIP_ACTIVE('#bd93f9', 'rgba(189, 147, 249, 0.12)', 'rgba(189, 147, 249, 0.30)')
    : CHIP_BASE;

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
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        title={has ? `Навык: ${value!.name} (+${value!.xp} XP при выполнении)` : 'Привязать навык'}
        style={chipStyle}
      >
        <IconTarget size={11} />
        {has ? <span>{value!.name} · {value!.xp}xp</span> : <span>skill</span>}
      </button>

      {open && (
        <div
          ref={popoverRef}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: popPos.top,
            bottom: popPos.bottom,
            left: popPos.left,
            right: popPos.right,
            zIndex: 1500,
            background: 'var(--bg)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius)',
            padding: '8px',
            minWidth: 'min(220px, calc(100vw - 24px))',
            maxWidth: 'calc(100vw - 24px)',
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
