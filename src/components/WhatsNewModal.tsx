import React from 'react';
import { CHANGELOG, APP_VERSION } from '../data/changelog';

interface Props {
  onClose: () => void;
}

export default function WhatsNewModal({ onClose }: Props) {
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 6000,
    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
    paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
    paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
    paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
  };

  const card: React.CSSProperties = {
    background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: '16px',
    padding: '2rem', maxWidth: '480px', width: '100%',
    boxShadow: 'var(--shadow-lg)',
    fontFamily: 'var(--font-body)',
    color: 'var(--text)',
    maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
  };

  const btn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--line)',
    color: 'var(--text)', borderRadius: '6px',
    padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: 500,
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Что нового
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              v{APP_VERSION}
            </span>
          </div>
          <button onClick={onClose} style={{ ...btn, padding: '2px 8px', fontSize: '1.2rem', border: 'none', color: 'var(--text-faint)' }}>×</button>
        </div>

        {/* Changelog list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {CHANGELOG.map((entry, i) => {
            const isCurrent = entry.version === APP_VERSION;
            return (
              <div
                key={entry.version}
                style={{
                  marginBottom: i < CHANGELOG.length - 1 ? '1.5rem' : 0,
                  paddingBottom: i < CHANGELOG.length - 1 ? '1.5rem' : 0,
                  borderBottom: i < CHANGELOG.length - 1 ? '1px solid var(--line)' : 'none',
                }}
              >
                {/* Version row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
                    color: isCurrent ? 'var(--accent)' : 'var(--text-sub)',
                    background: isCurrent ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: '4px', padding: '1px 6px',
                  }}>
                    v{entry.version}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                    {entry.title}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      текущая
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                    {entry.date}
                  </span>
                </div>

                {/* Items */}
                <ul style={{ margin: 0, padding: '0 0 0 1.1rem', listStyle: 'disc' }}>
                  {entry.items.map((item, j) => (
                    <li key={j} style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: '2px' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ ...btn, background: 'var(--accent)', border: 'none', color: 'var(--bg)', width: '100%', padding: '8px' }}
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
