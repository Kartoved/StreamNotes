import { useState, useEffect, useCallback } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

let _addToast: ((msg: string, variant: ToastVariant) => void) | null = null;
let _nextId = 1;

/** Call from anywhere — no React context required. */
export function showToast(message: string, variant: ToastVariant = 'info') {
  if (_addToast) {
    _addToast(message, variant);
  } else {
    // Fallback before component mounts
    if (variant === 'error') console.error('[toast]', message);
    else console.info('[toast]', message);
  }
}

const ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

const COLORS: Record<ToastVariant, string> = {
  success: 'var(--toast-success, #22c55e)',
  error: 'var(--toast-error, #f87171)',
  info: 'var(--toast-info, var(--text-sub))',
};

function ToastItem({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const t1 = requestAnimationFrame(() => setVisible(true));
    // Start exit after 2.7s, remove after transition (300ms)
    const t2 = setTimeout(() => setVisible(false), 2700);
    const t3 = setTimeout(() => onRemove(item.id), 3000);
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [item.id, onRemove]);

  return (
    <div
      onClick={() => { setVisible(false); setTimeout(() => onRemove(item.id), 300); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${COLORS[item.variant]}`,
        borderRadius: 'var(--radius)',
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        cursor: 'pointer',
        maxWidth: '360px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <span style={{ color: COLORS[item.variant], fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
        {ICONS[item.variant]}
      </span>
      <span style={{ fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.4 }}>
        {item.message}
      </span>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant) => {
    const id = _nextId++;
    setToasts(prev => [...prev, { id, message, variant }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} item={t} onRemove={removeToast} />
      ))}
    </div>
  );
}
