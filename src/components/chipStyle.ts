import React from 'react';

// Shared visual contract for footer/toolbar chips so they line up regardless
// of which control underneath (button, select, input). Height is fixed; pad
// horizontally only.
export const CHIP_HEIGHT = 22;

export const CHIP_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: `${CHIP_HEIGHT}px`,
  padding: '0 7px',
  fontSize: '0.7rem',
  fontFamily: 'var(--font-mono)',
  borderRadius: '4px',
  border: '1px solid var(--line)',
  background: 'var(--bg-hover)',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  userSelect: 'none',
  outline: 'none',
  whiteSpace: 'nowrap',
  lineHeight: 1,
  boxSizing: 'border-box',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  MozAppearance: 'none' as const,
  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
};

export const CHIP_ACTIVE = (color: string, bg: string, border: string): React.CSSProperties => ({
  ...CHIP_BASE,
  color,
  background: bg,
  borderColor: border,
});

// Select gets extra right padding for the custom chevron.
export const CHIP_SELECT: React.CSSProperties = {
  ...CHIP_BASE,
  paddingRight: '18px',
};
