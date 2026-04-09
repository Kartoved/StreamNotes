import React, { useState, useRef } from 'react';
import type { Feed as FeedData } from '../db/hooks';
import { useCrypto } from '../crypto/CryptoContext';

// ─── Helpers ──────────────────────────────────────────────────────────
const FEED_COLORS = ['#787774', '#c9cbd0', '#969591', '#b1b1ae', '#a3a6ad', '#37352f', '#606a7b', '#868e96'];
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
      width: '40px', height: '40px',
      borderRadius: active ? '12px' : '10px',
      background: feed.avatar ? 'transparent' : (active ? 'var(--text)' : 'var(--bg-aside)'),
      border: active ? 'none' : '1px solid var(--line)',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', flexShrink: 0,
      opacity: 1,
      transition: 'all 0.15s ease',
      boxShadow: 'none',
      color: active ? 'var(--bg)' : 'var(--text-faint)',
    }}>
      {feed.avatar
        ? <img src={feed.avatar} onError={(e) => (e.currentTarget.style.display = 'none')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: active ? 'white' : 'inherit', fontWeight: 700, fontSize: '0.85rem', userSelect: 'none' }}>{initials}</span>
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
  onImportSharedFeed,
  onShareFeed,
}: {
  feeds: FeedData[];
  activeFeedId: string | null;
  onSelect: (id: string) => void;
  onCreateFeed: (name: string, color: string, avatar: string | null) => void;
  onUpdateFeed: (id: string, name: string, color: string, avatar: string | null) => void;
  onDeleteFeed: (id: string, isShared: boolean) => void;
  onImportSharedFeed?: (payload: { flow_id: string; fek: string; name: string; relay?: string }) => void;
  onShareFeed?: (id: string) => void;
}) => {
  const { decryptFeedKey, nostrPubKey } = useCrypto();
  const [modal, setModal] = useState<'create' | 'share' | 'import' | FeedData | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalColor, setModalColor] = useState('#3b82f6');
  const [modalAvatar, setModalAvatar] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<string>('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const avatarRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setModalName(''); setModalColor(randomColor()); setModalAvatar(null); setModal('create');
  };
  const openEdit = (feed: FeedData) => {
    setModalName(feed.name); setModalColor(feed.color); setModalAvatar(feed.avatar); setModal(feed);
  };

  const handleSave = () => {
    if (!modalName.trim()) return;

    const trimmed = modalName.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"flow_id"')) {
      try {
        const data = JSON.parse(trimmed);
        if (data.flow_id && data.fek) {
          onImportSharedFeed?.(data);
          setModal(null);
          return;
        }
      } catch (e) { /* ignore */ }
    }

    if (modal === 'create') {
      onCreateFeed(trimmed, modalColor, modalAvatar);
    } else if (modal && typeof modal === 'object') {
      onUpdateFeed(modal.id, trimmed, modalColor, modalAvatar);
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

  const openShare = (feed: FeedData) => {
    if (!feed.encryption_key) return;
    try {
      const fekHex = decryptFeedKey(feed.encryption_key);
      const payload = JSON.stringify({
        flow_id: feed.id,
        fek: fekHex,
        name: feed.name,
        author_npub: nostrPubKey,
      }, null, 2);
      setSharePayload(payload);
      onShareFeed?.(feed.id);
      setModal('share');
    } catch (e) {
      console.error('Failed to generate share payload', e);
    }
  };

  const handleImportSubmit = () => {
    setImportError('');
    try {
      const data = JSON.parse(importText);
      if (!data.flow_id || !data.fek) {
        setImportError('Invalid payload: missing flow_id or fek');
        return;
      }
      onImportSharedFeed?.(data);
      setModal(null);
      setImportText('');
    } catch {
      setImportError('Invalid JSON');
    }
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
        width: '56px', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '14px', paddingBottom: '14px', gap: '4px',
        borderRight: '1px solid var(--line)',
        background: 'var(--sidebar-bg)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ fontSize: '1.4rem', marginBottom: '12px', userSelect: 'none', lineHeight: 1, color: 'var(--text)' }}>✦</div>
        <div className="feed-logo-sep" style={{ width: '28px', height: '1.5px', background: 'var(--line)', marginBottom: '16px' }} />

        {feeds.map(feed => (
          <div
            key={feed.id}
            className="feed-item"
            onClick={() => activeFeedId === feed.id ? openEdit(feed) : onSelect(feed.id)}
            style={{ padding: '6px 0' }}
          >
            <FeedIcon feed={feed} active={feed.id === activeFeedId} />
            <div className="feed-tooltip">{feed.name}</div>
          </div>
        ))}

        {/* Add feed */}
        <div className="feed-item" style={{ marginTop: '12px', padding: '6px 0' }}>
          <div
            onClick={openCreate}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              border: '1px solid var(--line-strong)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-faint)', fontSize: '1.4rem',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >+</div>
          <div className="feed-tooltip">Новый шифлоу</div>
        </div>

        {/* Import shared flow */}
        <div className="feed-item" style={{ padding: '6px 0' }}>
          <div
            onClick={() => { setImportText(''); setImportError(''); setModal('import'); }}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              border: '1px solid var(--line-strong)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-faint)', fontSize: '0.9rem',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            title="Import shared flow"
          >&#x21E9;</div>
          <div className="feed-tooltip">Import Flow</div>
        </div>
      </div>

      {/* Share modal */}
      {modal === 'share' && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)', border: '1px solid var(--line)',
              borderRadius: 'var(--radius-lg)', padding: '24px', width: '400px',
              display: 'flex', flexDirection: 'column', gap: '14px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>Share Flow</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', margin: 0, lineHeight: 1.5 }}>
              Send this invite payload to another Sheafy user. They can paste it into "Import Flow" to join this flow.
            </p>
            <textarea
              readOnly
              value={sharePayload}
              onClick={e => (e.target as HTMLTextAreaElement).select()}
              style={{
                width: '100%', minHeight: '140px', resize: 'vertical',
                background: 'var(--bg-hover)', border: '1px solid var(--line)',
                borderRadius: 'var(--radius)', color: 'var(--text)',
                fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                padding: '10px', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { navigator.clipboard.writeText(sharePayload); }}
                style={{ background: 'var(--text)', border: 'none', color: 'var(--bg)', borderRadius: 'var(--radius)', padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}
              >Copy</button>
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-sub)', borderRadius: 'var(--radius)', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {modal === 'import' && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)', border: '1px solid var(--line)',
              borderRadius: 'var(--radius-lg)', padding: '24px', width: '400px',
              display: 'flex', flexDirection: 'column', gap: '14px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>Import Shared Flow</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', margin: 0, lineHeight: 1.5 }}>
              Paste the invite payload you received from another user.
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder='{"flow_id": "...", "fek": "...", "name": "..."}'
              style={{
                width: '100%', minHeight: '120px', resize: 'vertical',
                background: 'var(--bg-hover)', border: '1px solid var(--line)',
                borderRadius: 'var(--radius)', color: 'var(--text)',
                fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                padding: '10px', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {importError && <div style={{ fontSize: '0.78rem', color: '#f87171' }}>{importError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-sub)', borderRadius: 'var(--radius)', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button
                onClick={handleImportSubmit}
                disabled={!importText.trim()}
                style={{ background: 'var(--text)', border: 'none', color: 'var(--bg)', borderRadius: 'var(--radius)', padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'var(--font-body)', opacity: importText.trim() ? 1 : 0.5 }}
              >Import</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {modal && modal !== 'share' && modal !== 'import' && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)', border: '1px solid var(--line)',
              borderRadius: 'var(--radius-lg)', padding: '24px', width: '380px',
              display: 'flex', flexDirection: 'column', gap: '20px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {modal === 'create' ? 'Новый шифлоу' : 'Редактировать шифлоу'}
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
                placeholder="Название шифлоу"
                autoFocus
                style={{
                  flex: 1, background: 'var(--bg)',
                  border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                  color: 'var(--text)', fontSize: '0.9rem',
                  padding: '8px 12px', outline: 'none',
                  fontFamily: 'var(--font-body)',
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
              {modal !== 'create' && typeof modal === 'object' && (
                <>
                  <button
                    onClick={() => { onDeleteFeed(modal.id, !!modal.is_shared); setModal(null); }}
                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem' }}
                  >{modal.is_shared ? 'Отписаться' : 'Удалить'}</button>
                  {modal.encryption_key && (
                    <button
                      onClick={() => openShare(modal)}
                      style={{ background: 'rgba(96,165,237,0.12)', border: '1px solid rgba(96,165,237,0.3)', color: '#6095ed', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                    >Share</button>
                  )}
                </>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button onClick={() => setModal(null)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-sub)', borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>Отмена</button>
                <button onClick={handleSave} disabled={!modalName.trim()} style={{ background: 'var(--text)', border: 'none', color: 'var(--bg)', borderRadius: 'var(--radius)', padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', opacity: modalName.trim() ? 1 : 0.5, fontFamily: 'var(--font-body)' }}>
                  {modal === 'create' ? 'Создать' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
