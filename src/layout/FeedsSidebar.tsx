import React, { useState, useRef } from 'react';
import type { Feed as FeedData } from '../db/hooks';
import { useCrypto } from '../crypto/CryptoContext';
import {
  Notebook, FileText, ScrollText, BookOpen,
  Code2, Terminal, Braces, Hash,
  Music, Camera, ImageIcon, Video,
  MessageCircle, Mail, Send, AtSign,
  Folder, Tag, Archive, Bookmark,
  Star, Heart, Briefcase, Globe,
  Zap, Flame, Coffee, Moon,
  Rocket, Trophy, Layers, Link2,
  type LucideIcon,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────
const FEED_COLORS = ['#787774', '#c9cbd0', '#969591', '#b1b1ae', '#a3a6ad', '#37352f', '#606a7b', '#868e96'];
const randomColor = () => FEED_COLORS[Math.floor(Math.random() * FEED_COLORS.length)];

// Curated icon set — slug maps to Lucide component
const FEED_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'Notebook', Icon: Notebook },
  { name: 'FileText', Icon: FileText },
  { name: 'ScrollText', Icon: ScrollText },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Code2', Icon: Code2 },
  { name: 'Terminal', Icon: Terminal },
  { name: 'Braces', Icon: Braces },
  { name: 'Hash', Icon: Hash },
  { name: 'Music', Icon: Music },
  { name: 'Camera', Icon: Camera },
  { name: 'ImageIcon', Icon: ImageIcon },
  { name: 'Video', Icon: Video },
  { name: 'MessageCircle', Icon: MessageCircle },
  { name: 'Mail', Icon: Mail },
  { name: 'Send', Icon: Send },
  { name: 'AtSign', Icon: AtSign },
  { name: 'Folder', Icon: Folder },
  { name: 'Tag', Icon: Tag },
  { name: 'Archive', Icon: Archive },
  { name: 'Bookmark', Icon: Bookmark },
  { name: 'Star', Icon: Star },
  { name: 'Heart', Icon: Heart },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Globe', Icon: Globe },
  { name: 'Zap', Icon: Zap },
  { name: 'Flame', Icon: Flame },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Moon', Icon: Moon },
  { name: 'Rocket', Icon: Rocket },
  { name: 'Trophy', Icon: Trophy },
  { name: 'Layers', Icon: Layers },
  { name: 'Link2', Icon: Link2 },
];

const ICON_MAP = new Map(FEED_ICONS.map(({ name, Icon }) => [name, Icon]));

export function getLucideIcon(name: string | null): LucideIcon | null {
  if (!name) return null;
  return ICON_MAP.get(name) ?? null;
}

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
  const LIcon = getLucideIcon(feed.icon);
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
        : LIcon
          ? <LIcon size={18} strokeWidth={1.5} color={active ? 'var(--bg)' : 'var(--text-faint)'} />
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
  onCreateFeed: (name: string, color: string, avatar: string | null, icon: string | null) => void;
  onUpdateFeed: (id: string, name: string, color: string, avatar: string | null, icon: string | null) => void;
  onDeleteFeed: (id: string, isShared: boolean) => void;
  onImportSharedFeed?: (payload: { flow_id: string; fek: string; name: string; relay?: string }) => void;
  onShareFeed?: (id: string) => void;
}) => {
  const { decryptFeedKey, nostrPubKey } = useCrypto();
  const [modal, setModal] = useState<'create' | 'share' | 'import' | FeedData | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalColor, setModalColor] = useState('#3b82f6');
  const [modalAvatar, setModalAvatar] = useState<string | null>(null);
  const [modalIcon, setModalIcon] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<string>('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const avatarRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setModalName(''); setModalColor(randomColor()); setModalAvatar(null); setModalIcon(null); setModal('create');
  };
  const openEdit = (feed: FeedData) => {
    setModalName(feed.name); setModalColor(feed.color); setModalAvatar(feed.avatar); setModalIcon(feed.icon); setModal(feed);
  };

  const handleSave = async () => {
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
      onCreateFeed(trimmed, modalColor, modalAvatar, modalIcon);
    } else if (modal && typeof modal === 'object') {
      await onUpdateFeed(modal.id, trimmed, modalColor, modalAvatar, modalIcon);
    }
    setModal(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeAvatar(file);
    setModalAvatar(dataUrl);
    setModalIcon(null);
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

  // Preview icon in modal avatar area
  const ModalPreviewIcon = modalIcon ? getLucideIcon(modalIcon) : null;

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
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)', border: '1px solid var(--line)',
              borderRadius: '12px', padding: '28px 28px 24px',
              width: '420px', display: 'flex', flexDirection: 'column', gap: '0',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}
          >
            {/* Header */}
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '20px' }}>
              {modal === 'create' ? 'Новый шифлоу' : 'Редактировать шифлоу'}
            </div>

            {/* Avatar + Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div
                onClick={() => avatarRef.current?.click()}
                title="Загрузить аватар"
                style={{
                  width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
                  background: modalAvatar ? 'transparent' : modalColor,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative',
                  border: '1px solid var(--line)',
                }}
              >
                {modalAvatar
                  ? <img src={modalAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : ModalPreviewIcon
                    ? <ModalPreviewIcon size={22} strokeWidth={1.5} color="white" />
                    : <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem', userSelect: 'none' }}>{(modalName || '?').slice(0, 2).toUpperCase()}</span>
                }
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.15s', fontSize: '1rem' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                >📷</div>
              </div>
              <input
                type="text"
                value={modalName}
                onChange={e => setModalName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder="Название"
                autoFocus
                style={{
                  flex: 1, background: 'var(--bg-hover)',
                  border: '1px solid var(--line)', borderRadius: '8px',
                  color: 'var(--text)', fontSize: '0.9rem', fontWeight: 500,
                  padding: '9px 12px', outline: 'none',
                  fontFamily: 'var(--font-body)',
                  transition: 'border-color 0.12s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--line-strong)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--line)')}
              />
            </div>

            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

            {/* Color swatches */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 24px)', gap: '8px', marginBottom: '16px' }}>
              {FEED_COLORS.map(swatch)}
              {modalAvatar && (
                <div
                  onClick={() => setModalAvatar(null)}
                  title="Убрать аватар"
                  style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--line)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-faint)' }}
                >✕</div>
              )}
            </div>

            {/* Icon picker */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                Иконка
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 32px)', gap: '4px' }}>
                {/* Clear icon option */}
                <div
                  onClick={() => setModalIcon(null)}
                  title="Без иконки"
                  style={{
                    width: '32px', height: '32px', borderRadius: '6px',
                    border: modalIcon === null && !modalAvatar ? '1.5px solid var(--text)' : '1px solid var(--line)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'var(--text-faint)', fontSize: '0.6rem',
                    background: modalIcon === null && !modalAvatar ? 'var(--bg-hover)' : 'transparent',
                    transition: '0.1s',
                  }}
                >Аб</div>
                {FEED_ICONS.map(({ name, Icon }) => (
                  <div
                    key={name}
                    onClick={() => { setModalIcon(name); setModalAvatar(null); }}
                    title={name}
                    style={{
                      width: '32px', height: '32px', borderRadius: '6px',
                      border: modalIcon === name ? '1.5px solid var(--text)' : '1px solid var(--line)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: modalIcon === name ? 'var(--bg-hover)' : 'transparent',
                      color: modalIcon === name ? 'var(--text)' : 'var(--text-faint)',
                      transition: '0.1s',
                    }}
                    onMouseEnter={e => { if (modalIcon !== name) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; } }}
                    onMouseLeave={e => { if (modalIcon !== name) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; } }}
                  >
                    <Icon size={15} strokeWidth={1.5} />
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--line)', margin: '0 0 20px' }} />

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {modal !== 'create' && typeof modal === 'object' && (
                <>
                  <button
                    onClick={() => { onDeleteFeed(modal.id, !!modal.is_shared); setModal(null); }}
                    style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#f87171'; (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
                  >{modal.is_shared ? 'Отписаться' : 'Удалить'}</button>
                  {modal.encryption_key && (
                    <button
                      onClick={() => openShare(modal)}
                      style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
                    >Поделиться</button>
                  )}
                </>
              )}
              <button
                onClick={() => setModal(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-sub)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}
              >Отмена</button>
              <button
                onClick={handleSave}
                disabled={!modalName.trim()}
                style={{ flex: 1, background: 'var(--text)', border: 'none', color: 'var(--bg)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', opacity: modalName.trim() ? 1 : 0.4, fontFamily: 'var(--font-body)', transition: 'opacity 0.12s' }}
              >
                {modal === 'create' ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
