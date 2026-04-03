import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export const Lightbox = ({ url, name, onClose }: { url: string; name: string; onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={url}
        alt={name}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '95vw', maxHeight: '95vh',
          borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          cursor: 'default', objectFit: 'contain',
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: '24px', right: '24px',
          background: 'rgba(255,255,255,0.2)', border: 'none',
          color: 'white', fontSize: '24px', width: '44px', height: '44px',
          borderRadius: '50%', cursor: 'pointer', lineHeight: '44px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>
    </div>,
    document.body
  );
};
