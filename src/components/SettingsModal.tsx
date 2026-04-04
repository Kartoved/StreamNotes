import { useState } from 'react';
import { useCrypto } from '../crypto/CryptoContext';
import { decryptSeedWithPassword } from '../crypto/CryptoContext';
import { validateMnemonic } from '../crypto';

interface Props {
  onClose: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function SettingsModal({ onClose, onExport, onImport }: Props) {
  const { nostrPubKey } = useCrypto();
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [seedRevealed, setSeedRevealed] = useState('');
  const [copied, setCopied] = useState(false);

  const shortNpub = nostrPubKey
    ? nostrPubKey.slice(0, 8) + '...' + nostrPubKey.slice(-8)
    : '—';

  const handleCopyNpub = () => {
    navigator.clipboard.writeText(nostrPubKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRevealSeed = () => {
    const plain = localStorage.getItem('sn_seed_plain');
    if (plain && validateMnemonic(plain)) {
      setSeedRevealed(plain);
      return;
    }
    setShowPasswordInput(true);
    setPasswordHint('Введите пароль для расшифровки seed-фразы.');
    setPasswordError('');
  };

  const handleUnlockWithPassword = () => {
    const encrypted = localStorage.getItem('sn_seed_encrypted');
    if (!encrypted) { setPasswordError('Seed не найден.'); return; }
    const result = decryptSeedWithPassword(encrypted, passwordInput);
    if (!result) { setPasswordError('Неверный пароль.'); return; }
    setSeedRevealed(result);
    setShowPasswordInput(false);
    setPasswordError('');
    setPasswordHint('');
    setPasswordInput('');
  };

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 5000,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '1rem',
  };

  const card: React.CSSProperties = {
    background: 'var(--card-bg)', backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid var(--border)', borderRadius: '16px',
    padding: '1.5rem', maxWidth: '440px', width: '100%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
    fontFamily: "'Source Code Pro', monospace",
    color: 'var(--text-main)',
  };

  const sectionDivider: React.CSSProperties = {
    marginBottom: '1.25rem',
    paddingBottom: '1.25rem',
    borderBottom: '1px solid var(--border)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: '6px', display: 'block',
  };

  const btn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-main)', borderRadius: '8px',
    padding: '6px 14px', fontSize: '13px', cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const btnAccent: React.CSSProperties = {
    ...btn, background: 'var(--accent)', border: 'none', color: '#fff',
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '8px 10px',
    color: 'var(--text-main)', fontFamily: 'inherit',
    fontSize: '13px', width: '100%',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>Настройки</h2>
          <button onClick={onClose} style={{ ...btn, padding: '2px 10px', fontSize: '18px', lineHeight: 1 }}>×</button>
        </div>

        {/* Identity */}
        <div style={sectionDivider}>
          <span style={labelStyle}>Nostr Identity (npub)</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <code style={{
              flex: 1, fontSize: '12px', color: 'var(--text-muted)',
              background: 'rgba(0,0,0,0.2)', borderRadius: '6px',
              padding: '6px 10px', wordBreak: 'break-all',
            }}>
              {shortNpub}
            </code>
            <button onClick={handleCopyNpub} style={btn}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
            Публичный ключ для будущей p2p синхронизации.
          </p>
        </div>

        {/* Seed phrase */}
        <div>
          <span style={labelStyle}>Seed-фраза</span>

          {seedRevealed ? (
            <div>
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px', padding: '12px',
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px',
                marginBottom: '8px',
              }}>
                {seedRevealed.split(' ').map((word, i) => (
                  <div key={i} style={{ fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{i + 1}. </span>
                    {word}
                  </div>
                ))}
              </div>
              <button onClick={() => setSeedRevealed('')} style={btn}>Скрыть</button>
            </div>
          ) : showPasswordInput ? (
            <div>
              {passwordHint && !passwordError && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px' }}>{passwordHint}</p>
              )}
              {passwordError && (
                <p style={{ fontSize: '12px', color: '#f87171', margin: '0 0 8px' }}>{passwordError}</p>
              )}
              <input
                style={inputStyle}
                type="password"
                placeholder="Пароль"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUnlockWithPassword()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={handleUnlockWithPassword} style={btnAccent}>Показать</button>
                <button onClick={() => { setShowPasswordInput(false); setPasswordError(''); setPasswordHint(''); setPasswordInput(''); }} style={btn}>Отмена</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Храните seed-фразу в безопасном месте — она восстанавливает все данные и ключи.
              </p>
              <button
                onClick={handleRevealSeed}
                style={{ ...btn, borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
              >
                Показать seed-фразу
              </button>
            </div>
          )}
        </div>

        {/* Data management */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
          <span style={labelStyle}>Данные</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onExport} style={btn}>↑ Экспорт</button>
            <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              ↓ Импорт
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={onImport} />
            </label>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
            Создавайте резервные копии всех лент и заметок.
          </p>
        </div>
      </div>
    </div>
  );
}
