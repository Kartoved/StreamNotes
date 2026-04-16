import React, { useState, useRef, useCallback } from 'react';
import { secp256k1 } from '@noble/curves/secp256k1';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
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
const FEED_COLORS = [
  // muted hues
  '#6b4444', '#6b5533', '#556b33', '#336b4a', '#33576b', '#334a6b', '#4a336b', '#6b3355',
  // neutrals
  '#37352f', '#4a4a4a', '#606a7b', '#787774', '#868e96', '#a3a6ad', '#b1b1ae', '#c9cbd0',
];
const randomColor = () => FEED_COLORS[Math.floor(Math.random() * FEED_COLORS.length)];

// Lucide icons stored as "lucide:Name" in the avatar field — no extra column needed
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
const LUCIDE_PREFIX = 'lucide:';

/** Returns the Lucide component if avatar encodes an icon (e.g. "lucide:Notebook"), else null */
export function parseLucideAvatar(avatar: string | null): LucideIcon | null {
  if (!avatar?.startsWith(LUCIDE_PREFIX)) return null;
  return ICON_MAP.get(avatar.slice(LUCIDE_PREFIX.length)) ?? null;
}

/** Encode a Lucide icon name into the avatar slot */
const lucideAvatar = (name: string) => `${LUCIDE_PREFIX}${name}`;

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
  const LIcon = parseLucideAvatar(feed.avatar);
  const isImageAvatar = feed.avatar && !feed.avatar.startsWith(LUCIDE_PREFIX);
  return (
    <div style={{
      width: '40px', height: '40px',
      borderRadius: active ? '12px' : '10px',
      background: isImageAvatar ? 'transparent' : (feed.color || 'var(--bg-aside)'),
      border: active ? '2px solid var(--text)' : '1px solid transparent',
      outline: active ? '2px solid var(--bg-aside)' : 'none',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', flexShrink: 0,
      transition: 'all 0.15s ease',
    }}>
      {LIcon
        ? <LIcon size={18} strokeWidth={1.5} color="white" />
        : feed.avatar
          ? <img src={feed.avatar} onError={(e) => (e.currentTarget.style.display = 'none')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ color: 'white', fontWeight: 700, fontSize: '0.85rem', userSelect: 'none' }}>{initials}</span>
      }
    </div>
  );
};

// ─── ECDH helpers for pubkey-based sharing ────────────────────────────
const NPUBENC_PREFIX = 'npubenc1:';

function encryptPayloadForPubkey(payload: string, recipientPubHex: string, senderPrivKey: Uint8Array): string {
  const sharedPoint = secp256k1.getSharedSecret(senderPrivKey, '02' + recipientPubHex);
  const sharedSecret = sharedPoint.slice(1, 33);
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  const ct = cipher.encrypt(new TextEncoder().encode(payload));
  const combined = new Uint8Array(24 + ct.length);
  combined.set(nonce, 0);
  combined.set(ct, 24);
  return NPUBENC_PREFIX + recipientPubHex + ':' + bytesToHex(combined);
}

function decryptPayloadForMe(encoded: string, myPrivKey: Uint8Array): string {
  // Format: npubenc1:{recipientPubHex}:{nonceHex + ciphertextHex}
  // We don't need recipientPubHex for decryption — we need the SENDER's pubkey.
  // But we included it so the recipient can verify they're the intended target.
  // The actual ECDH uses myPrivKey + senderPubKey.
  // Updated format: npubenc1:{senderPubHex}:{encryptedHex}
  const rest = encoded.slice(NPUBENC_PREFIX.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) throw new Error('invalid format');
  const senderPubHex = rest.slice(0, colonIdx);
  const encHex = rest.slice(colonIdx + 1);
  const bytes = hexToBytes(encHex);
  const nonce = bytes.slice(0, 24);
  const ct = bytes.slice(24);
  const sharedPoint = secp256k1.getSharedSecret(myPrivKey, '02' + senderPubHex);
  const sharedSecret = sharedPoint.slice(1, 33);
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  return new TextDecoder().decode(cipher.decrypt(ct));
}

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
  onArchiveFeed,
  onExportFeedMD,
}: {
  feeds: FeedData[];
  activeFeedId: string | null;
  onSelect: (id: string) => void;
  onCreateFeed: (name: string, color: string, avatar: string | null) => void;
  onUpdateFeed: (id: string, name: string, color: string, avatar: string | null) => void;
  onDeleteFeed: (id: string, isShared: boolean) => void;
  onImportSharedFeed?: (payload: { flow_id: string; fek: string; name: string; relay?: string; role?: string; author_npub?: string; notes?: any[]; links?: any[] }) => void;
  onShareFeed?: (id: string) => Promise<{ notes: any[]; links: any[] } | null>;
  onArchiveFeed?: (id: string, archived: boolean) => void;
  onExportFeedMD?: (id: string, name: string) => void;
}) => {
  const { decryptFeedKey, nostrPubKey, nostrPrivKey } = useCrypto();
  const [modal, setModal] = useState<'create' | 'share' | 'import' | FeedData | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalColor, setModalColor] = useState('#3b82f6');
  // avatar holds either a data-URL (image), a "lucide:Name" string, or null
  const [modalAvatar, setModalAvatar] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<string>('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const avatarRef = useRef<HTMLInputElement>(null);
  // Archive view toggle
  const [showArchive, setShowArchive] = useState(false);
  // Pubkey sharing state
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [encryptedPayload, setEncryptedPayload] = useState('');
  const [pubkeyError, setPubkeyError] = useState('');
  const [shareRole, setShareRole] = useState<'reader' | 'participant' | 'admin'>('participant');
  const [shareFeedId, setShareFeedId] = useState<string | null>(null);
  const [shareSnapshot, setShareSnapshot] = useState<{ notes: any[]; links: any[] } | null>(null);

  const openCreate = () => {
    setModalName(''); setModalColor(randomColor()); setModalAvatar(null); setModal('create');
  };
  const openEdit = (feed: FeedData) => {
    setModalName(feed.name); setModalColor(feed.color); setModalAvatar(feed.avatar); setModal(feed);
  };

  const handleSave = async () => {
    if (!modalName.trim()) return;

    let trimmed = modalName.trim();
    // Handle paste of encrypted invite payload
    if (trimmed.startsWith(NPUBENC_PREFIX)) {
      try { trimmed = decryptPayloadForMe(trimmed, nostrPrivKey); } catch { /* ignore */ }
    }
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
      await onUpdateFeed(modal.id, trimmed, modalColor, modalAvatar);
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

  const buildSharePayload = (feed: FeedData, role: 'reader' | 'participant' | 'admin', snapshot?: { notes: any[]; links: any[] } | null) => {
    const fekHex = decryptFeedKey(feed.encryption_key!);
    return JSON.stringify({
      flow_id: feed.id,
      fek: fekHex,
      name: feed.name,
      author_npub: nostrPubKey,
      role,
      ...(snapshot?.notes?.length ? { notes: snapshot.notes } : {}),
      ...(snapshot?.links?.length ? { links: snapshot.links } : {}),
    }, null, 2);
  };

  const openShare = async (feed: FeedData) => {
    if (!feed.encryption_key) return;
    try {
      setShareFeedId(feed.id);
      setRecipientPubkey('');
      setEncryptedPayload('');
      setPubkeyError('');
      setShareSnapshot(null);
      setSharePayload('Загружаю...');
      setModal('share');

      // onShareFeed marks the feed as shared AND returns a notes snapshot
      const snapshot = onShareFeed ? await onShareFeed(feed.id) : null;
      setShareSnapshot(snapshot);
      setSharePayload(buildSharePayload(feed, shareRole, snapshot));
    } catch (e) {
      console.error('[share] Failed to generate share payload:', e);
      setSharePayload('Ошибка при генерации payload');
    }
  };

  const handleEncryptForPubkey = useCallback(() => {
    const hex = recipientPubkey.trim().replace(/^npub/, '');
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      setPubkeyError('Введите 64-символьный hex-ключ получателя (npub без префикса)');
      return;
    }
    try {
      const encrypted = encryptPayloadForPubkey(sharePayload, hex.toLowerCase(), nostrPrivKey);
      setEncryptedPayload(encrypted);
      setPubkeyError('');
    } catch (e) {
      setPubkeyError('Ошибка шифрования: ' + String(e));
    }
  }, [recipientPubkey, sharePayload, nostrPrivKey]);

  // Regenerate share payload when role changes (while share modal is open)
  const handleRoleChange = useCallback((newRole: 'reader' | 'participant' | 'admin') => {
    setShareRole(newRole);
    setEncryptedPayload('');
    // Rebuild payload with new role — find the feed from shareFeedId
    if (!shareFeedId) return;
    const feed = feeds.find(f => f.id === shareFeedId);
    if (!feed?.encryption_key) return;
    try { setSharePayload(buildSharePayload(feed, newRole, shareSnapshot)); } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareFeedId, feeds, shareSnapshot]);

  const handleImportSubmit = () => {
    setImportError('');
    let text = importText.trim();

    // Handle pubkey-encrypted payload
    if (text.startsWith(NPUBENC_PREFIX)) {
      try {
        text = decryptPayloadForMe(text, nostrPrivKey);
      } catch {
        setImportError('Не удалось расшифровать: убедитесь, что payload зашифрован для вашего pubkey');
        return;
      }
    }

    try {
      const data = JSON.parse(text);
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
      onClick={() => setModalColor(color)}
      style={{
        width: '24px', height: '24px', borderRadius: '50%', background: color, cursor: 'pointer',
        border: color === modalColor && !parseLucideAvatar(modalAvatar) ? '2px solid white' : '2px solid transparent',
        transition: '0.1s',
      }}
    />
  );

  // Derived state from modalAvatar
  const selectedIcon = parseLucideAvatar(modalAvatar) ? modalAvatar!.slice(LUCIDE_PREFIX.length) : null;
  const isImageAvatar = modalAvatar && !modalAvatar.startsWith(LUCIDE_PREFIX);
  const ModalPreviewIcon = selectedIcon ? ICON_MAP.get(selectedIcon) : null;

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

        {feeds.filter(f => showArchive ? f.is_archived : !f.is_archived).map(feed => (
          <div
            key={feed.id}
            className="feed-item"
            onClick={() => activeFeedId === feed.id ? openEdit(feed) : onSelect(feed.id)}
            style={{ padding: '6px 0' }}
          >
            <FeedIcon feed={feed} active={feed.id === activeFeedId} />
            <div className="feed-tooltip">{showArchive ? `[архив] ${feed.name}` : feed.name}</div>
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

        {/* Archive toggle */}
        <div className="feed-item" style={{ padding: '6px 0', marginTop: 'auto' }}>
          <div
            onClick={() => setShowArchive(v => !v)}
            title={showArchive ? 'Скрыть архив' : 'Архив'}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              border: showArchive ? '1.5px solid var(--text)' : '1px solid var(--line-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: showArchive ? 'var(--text)' : 'var(--text-faint)',
              background: showArchive ? 'var(--bg-hover)' : 'transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!showArchive) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}}
            onMouseLeave={e => { if (!showArchive) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8"/>
              <rect x="1" y="3" width="22" height="5"/>
              <line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </div>
          <div className="feed-tooltip">{showArchive ? 'Назад к лентам' : 'Архив'}</div>
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
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>Поделиться шифлоу</div>

            {/* Role picker */}
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>Права доступа</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['reader', 'participant', 'admin'] as const).map(r => {
                  const labels = { reader: 'Читатель', participant: 'Участник', admin: 'Админ' };
                  const descs = { reader: 'только чтение', participant: 'читать + писать свои', admin: 'полный доступ' };
                  const active = shareRole === r;
                  return (
                    <button key={r} onClick={() => handleRoleChange(r)} style={{
                      flex: 1, border: active ? '1.5px solid var(--text)' : '1px solid var(--line)',
                      background: active ? 'var(--bg-hover)' : 'transparent',
                      borderRadius: 'var(--radius)', padding: '6px 4px', cursor: 'pointer',
                      color: active ? 'var(--text)' : 'var(--text-faint)', fontFamily: 'var(--font-body)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                    }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{labels[r]}</span>
                      <span style={{ fontSize: '0.62rem', opacity: 0.7 }}>{descs[r]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-sub)', margin: 0, lineHeight: 1.5 }}>
              Скопируй payload или зашифруй для конкретного npub — только получатель сможет его импортировать.
            </p>

            {/* Plain payload */}
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Открытый payload</div>
            <textarea
              readOnly
              value={sharePayload}
              onClick={e => (e.target as HTMLTextAreaElement).select()}
              style={{
                width: '100%', minHeight: '100px', resize: 'vertical',
                background: 'var(--bg-hover)', border: '1px solid var(--line)',
                borderRadius: 'var(--radius)', color: 'var(--text)',
                fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                padding: '10px', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => { navigator.clipboard.writeText(sharePayload); }}
              style={{ alignSelf: 'flex-start', background: 'var(--text)', border: 'none', color: 'var(--bg)', borderRadius: 'var(--radius)', padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}
            >Копировать</button>

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--line)' }} />

            {/* Pubkey encryption */}
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Зашифровать для npub</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="64-символьный hex pubkey получателя"
                value={recipientPubkey}
                onChange={e => { setRecipientPubkey(e.target.value); setEncryptedPayload(''); setPubkeyError(''); }}
                style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', padding: '6px 10px', outline: 'none', boxSizing: 'border-box' }}
              />
              <button
                onClick={handleEncryptForPubkey}
                disabled={!recipientPubkey.trim()}
                style={{ background: 'var(--text)', border: 'none', color: 'var(--bg)', borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-body)', opacity: recipientPubkey.trim() ? 1 : 0.4 }}
              >Encrypt</button>
            </div>
            {pubkeyError && <div style={{ fontSize: '0.75rem', color: '#f87171' }}>{pubkeyError}</div>}
            {encryptedPayload && (
              <>
                <textarea
                  readOnly
                  value={encryptedPayload}
                  onClick={e => (e.target as HTMLTextAreaElement).select()}
                  style={{
                    width: '100%', minHeight: '80px', resize: 'vertical',
                    background: 'var(--bg-hover)', border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)', color: 'var(--text)',
                    fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
                    padding: '10px', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(encryptedPayload)}
                  style={{ alignSelf: 'flex-start', background: 'var(--text)', border: 'none', color: 'var(--bg)', borderRadius: 'var(--radius)', padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}
                >Копировать encrypted</button>
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-sub)', borderRadius: 'var(--radius)', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>Закрыть</button>
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

            {/* Avatar preview + Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div
                onClick={() => avatarRef.current?.click()}
                title="Загрузить аватар"
                style={{
                  width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
                  background: isImageAvatar ? 'transparent' : modalColor,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative',
                  border: '1px solid var(--line)',
                }}
              >
                {isImageAvatar
                  ? <img src={modalAvatar!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : ModalPreviewIcon
                    ? <ModalPreviewIcon size={22} strokeWidth={1.5} color="white" />
                    : <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem', userSelect: 'none' }}>{(modalName || '?').slice(0, 2).toUpperCase()}</span>
                }
                <div
                  style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.15s', fontSize: '1rem' }}
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
              {isImageAvatar && (
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
                {/* Clear / initials option */}
                <div
                  onClick={() => setModalAvatar(null)}
                  title="Без иконки"
                  style={{
                    width: '32px', height: '32px', borderRadius: '6px',
                    border: !modalAvatar ? '1.5px solid var(--text)' : '1px solid var(--line)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'var(--text-faint)', fontSize: '0.6rem',
                    background: !modalAvatar ? 'var(--bg-hover)' : 'transparent',
                    transition: '0.1s',
                  }}
                >Аб</div>
                {FEED_ICONS.map(({ name, Icon }) => (
                  <div
                    key={name}
                    onClick={() => setModalAvatar(lucideAvatar(name))}
                    title={name}
                    style={{
                      width: '32px', height: '32px', borderRadius: '6px',
                      border: selectedIcon === name ? '1.5px solid var(--text)' : '1px solid var(--line)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: selectedIcon === name ? 'var(--bg-hover)' : 'transparent',
                      color: selectedIcon === name ? 'var(--text)' : 'var(--text-faint)',
                      transition: '0.1s',
                    }}
                    onMouseEnter={e => { if (selectedIcon !== name) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; } }}
                    onMouseLeave={e => { if (selectedIcon !== name) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; } }}
                  >
                    <Icon size={15} strokeWidth={1.5} />
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--line)', margin: '0 0 20px' }} />

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {modal !== 'create' && typeof modal === 'object' && (
                <>
                  <button
                    onClick={() => { onDeleteFeed(modal.id, !!modal.is_shared); setModal(null); }}
                    style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#f87171'; (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
                  >{modal.is_shared ? 'Отписаться' : 'Удалить'}</button>
                  <button
                    onClick={() => { onArchiveFeed?.(modal.id, !modal.is_archived); setModal(null); }}
                    style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
                  >{modal.is_archived ? 'Разархивировать' : 'В архив'}</button>
                  {modal.encryption_key && (
                    <button
                      onClick={() => openShare(modal)}
                      style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
                    >Поделиться</button>
                  )}
                  {onExportFeedMD && (
                    <button
                      onClick={() => { onExportFeedMD(modal.id, modal.name); setModal(null); }}
                      style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
                    >В Markdown</button>
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
