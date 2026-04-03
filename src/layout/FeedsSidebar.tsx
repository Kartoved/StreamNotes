import React, { useState, useRef } from 'react';
import type { Feed as FeedData } from '../db/hooks';

// ─── Helpers ──────────────────────────────────────────────────────────
const FEED_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
const randomColor = () => FEED_COLORS[Math.floor(Math.random() * FEED_COLORS.length)];

async function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const s = Math.max(64 / img.width, 64 / img.height);
      const w = img.width * s; const h = img.height * s;
      ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.src = url;
  });
}

// ─── Feed Icon ────────────────────────────────────────────────────────
const FeedIcon = ({ feed, active }: { feed: FeedData; active: boolean }) => {
  const initials = feed.name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: '44px', height: '44px', borderRadius: active ? '14px' : '50%',
      background: feed.avatar ? 'transparent' : feed.color,
      border: active ? `2px solid ${feed.color}` : '2px solid transparent',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', flexShrink: 0,
      boxShadow: active ? `0 0 0 2px ${feed.color}44` : 'none',
      transition: 'border-radius 0.2s, box-shadow 0.2s, border 0.2s',
    }}>
      {feed.avatar
        ? <img src={feed.avatar} onError={(e) => (e.currentTarget.style.display = 'none')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem', userSelect: 'none' }}>{initials}</span>
      }
    </div>
  );
};

// ─── Feeds Sidebar ────────────────────────────────────────────────────
export const FeedsSidebar = ({
  feeds,
  activeFeedId,
  onSelect,
  onCreateFeed,
  onUpdateFeed,
  onDeleteFeed,
}: {
  feeds: FeedData[];
  activeFeedId: string | null;
  onSelect: (id: string) => void;
  onCreateFeed: (name: string, color: string, avatar: string | null) => void;
  onUpdateFeed: (id: string, name: string, color: string, avatar: string | null) => void;
  onDeleteFeed: (id: string) => void;
}) => {
  const [modal, setModal] = useState<'create' | FeedData | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalColor, setModalColor] = useState('#3b82f6');
  const [modalAvatar, setModalAvatar] = useState<string | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setModalName(''); setModalColor(randomColor()); setModalAvatar(null); setModal('create');
  };
  const openEdit = (feed: FeedData) => {
    setModalName(feed.name); setModalColor(feed.color); setModalAvatar(feed.avatar); setModal(feed);
  };

  const handleSave = () => {
    if (!modalName.trim()) return;
    if (modal === 'create') {
      onCreateFeed(modalName.trim(), modalColor, modalAvatar);
    } else if (modal && typeof modal === 'object') {
      onUpdateFeed(modal.id, modalName.trim(), modalColor, modalAvatar);
    }
    setModal(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeAvatar(file);
    setModalAvatar(dataUrl);
    e.target.value = '';
  };

  const swatch = (color: string) => (
    <div
      key={color}
      onClick={() => { setModalColor(color); setModalAvatar(null); }}
      style={{
        width: '24px', height: '24px', borderRadius: '50%', background: color, cursor: 'pointer',
        border: color === modalColor && !modalAvatar ? '2px solid white' : '2px solid transparent',
        transition: '0.1s',
      }}
    />
  );

  return (
    <>
      <div className="feeds-sidebar" style={{
        width: '64px', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '12px', paddingBottom: '12px', gap: '8px',
        borderRight: '1px solid var(--border)',
        background: 'var(--card-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ fontSize: '1.4rem', marginBottom: '4px', userSelect: 'none' }}>📝</div>
        <div className="feed-logo-sep" style={{ width: '32px', height: '1px', background: 'var(--border)', marginBottom: '4px' }} />

        {feeds.map(feed => (
          <div
            key={feed.id}
            className="feed-item"
            onClick={() => activeFeedId === feed.id ? openEdit(feed) : onSelect(feed.id)}
          >
            <FeedIcon feed={feed} active={feed.id === activeFeedId} />
            <div className="feed-tooltip">{feed.name}</div>
          </div>
        ))}

        {/* Add feed */}
        <div className="feed-item" style={{ marginTop: '4px' }}>
          <div
            onClick={openCreate}
            style={{
              width: '44px', height: '44px', borderRadius: '50%',
              border: '2px dashed var(--border)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.4rem',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          >+</div>
          <div className="feed-tooltip">Новая лента</div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '24px', width: '300px',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              display: 'flex', flexDirection: 'column', gap: '16px',
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {modal === 'create' ? 'Новая лента' : 'Редактировать ленту'}
            </div>

            {/* Preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                onClick={() => avatarRef.current?.click()}
                style={{
                  width: '52px', height: '52px', borderRadius: '16px',
                  background: modalAvatar ? 'transparent' : modalColor,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, border: '2px solid var(--border)',
                  position: 'relative',
                }}
                title="Загрузить аватар"
              >
                {modalAvatar
                  ? <img src={modalAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: 'white', fontWeight: 700, fontSize: '1.2rem' }}>{(modalName || '?').slice(0, 2).toUpperCase()}</span>
                }
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                >
                  <span style={{ fontSize: '1.2rem' }}>📷</span>
                </div>
              </div>
              <input
                type="text"
                value={modalName}
                onChange={e => setModalName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder="Название ленты"
                autoFocus
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  color: 'var(--text-main)', fontSize: '0.95rem',
                  padding: '8px 12px', outline: 'none',
                }}
              />
            </div>

            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

            {/* Color swatches */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {FEED_COLORS.map(swatch)}
              {modalAvatar && (
                <div onClick={() => setModalAvatar(null)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }} title="Убрать аватар">✕</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              {modal !== 'create' && typeof modal === 'object' && (
                <button
                  onClick={() => { onDeleteFeed(modal.id); setModal(null); }}
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', marginRight: 'auto' }}
                >Удалить</button>
              )}
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>Отмена</button>
              <button onClick={handleSave} disabled={!modalName.trim()} style={{ background: 'var(--accent)', border: 'none', color: 'white', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', opacity: modalName.trim() ? 1 : 0.5 }}>
                {modal === 'create' ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
