import { useState } from 'react';
import { useCrypto } from '../crypto/CryptoContext';
import { decryptSeedWithPassword } from '../crypto/CryptoContext';
import { validateMnemonic } from '../crypto';
import SyncRelaysPanel from './SyncRelaysPanel';
import { THEMES, type ThemeId } from '../themes';

interface Props {
  onClose: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  font: string;
  setFont: (f: string) => void;
  fontOptions: string[];
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  onSetNickname?: (name: string) => void;
}

export default function SettingsModal({ onClose, onExport, onImport, font, setFont, fontOptions, theme, setTheme, onSetNickname }: Props) {
  const { nostrPubKey, logout, nickname, setNickname: setNicknameCrypto } = useCrypto();
  const setNickname = onSetNickname ?? setNicknameCrypto;
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
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '1rem',
  };

  const card: React.CSSProperties = {
    background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: '16px',
    padding: '2rem', maxWidth: '440px', width: '100%',
    boxShadow: 'var(--shadow-lg)',
    fontFamily: "var(--font-body)",
    color: 'var(--text)',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  const sectionDivider: React.CSSProperties = {
    marginBottom: '1.5rem',
    paddingBottom: '1.5rem',
    borderBottom: '1px solid var(--line)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    fontWeight: 700,
    marginBottom: '8px', display: 'block',
  };

  const btn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--line)',
    color: 'var(--text)', borderRadius: '6px',
    padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: 500,
  };

  const btnAccent: React.CSSProperties = {
    ...btn, background: 'var(--accent)', border: 'none', color: 'var(--bg)',
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--line)',
    borderRadius: '6px', padding: '8px 10px',
    color: 'var(--text)', fontFamily: 'var(--font-mono)',
    fontSize: '0.8rem', width: '100%', outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23787774'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '14px',
    paddingRight: '32px',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} className="settings-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Настройки</h2>
          <button onClick={onClose} style={{ ...btn, padding: '2px 8px', fontSize: '1.2rem', border: 'none', color: 'var(--text-faint)' }}>×</button>
        </div>

        {/* Appearance */}
        <div style={sectionDivider}>
            <span style={labelStyle}>Оформление</span>

            {/* Theme switcher */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              {THEMES.map(t => {
                const p = t.preview;
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    title={t.label}
                    style={{
                      padding: 0, cursor: 'pointer', background: 'none',
                      border: active ? '2px solid var(--text)' : '2px solid var(--line)',
                      borderRadius: '8px', overflow: 'hidden',
                      transition: 'border-color 0.15s',
                      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                    }}
                  >
                    {/* Mini app preview */}
                    <div style={{ display: 'flex', width: '80px', height: '52px', background: p.bg }}>
                      {/* Sidebar strip */}
                      <div style={{ width: '18px', background: p.sidebar, borderRight: `1px solid ${p.line}`, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '6px', gap: '4px' }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{ width: '8px', height: '8px', borderRadius: '2px', background: p.textSub, opacity: i === 1 ? 0.6 : 0.25 }} />
                        ))}
                      </div>
                      {/* Main area */}
                      <div style={{ flex: 1, padding: '5px 5px 5px 4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {/* Header bar */}
                        <div style={{ height: '5px', borderRadius: '2px', background: p.textSub, opacity: 0.2, width: '60%' }} />
                        {/* Cards */}
                        {[0, 1].map(i => (
                          <div key={i} style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: '3px', padding: '3px 4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ height: '3px', borderRadius: '1px', background: p.text, opacity: 0.7, width: i === 0 ? '70%' : '50%' }} />
                            <div style={{ height: '2px', borderRadius: '1px', background: p.textSub, opacity: 0.4, width: '85%' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Label */}
                    <div style={{
                      fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em',
                      color: active ? 'var(--text)' : 'var(--text-faint)',
                      padding: '4px 0',
                      textAlign: 'center',
                      background: 'var(--bg)',
                      borderTop: '1px solid var(--line)',
                      transition: 'color 0.15s',
                    }}>
                      {t.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Font picker */}
            <div style={{ position: 'relative' }}>
                <select
                    style={selectStyle}
                    value={font}
                    onChange={e => setFont(e.target.value)}
                >
                    {fontOptions.map(f => <option key={f} value={f} style={{ background: 'var(--bg)', color: 'var(--text)' }}>{f}</option>)}
                </select>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', margin: '8px 0 0' }}>
              Выберите шрифт, который будет использоваться по умолчанию.
            </p>
        </div>

        {/* Identity */}
        <div style={sectionDivider}>
          <span style={labelStyle}>Профиль</span>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-sub)', display: 'block', marginBottom: '6px' }}>Никнейм</label>
            <input 
              style={{ ...inputStyle, fontFamily: 'var(--font-body)' }}
              placeholder="Ваш никнейм (локально)"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
          </div>
          <span style={labelStyle}>Nostr Identity (npub)</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <code style={{
              flex: 1, fontSize: '0.72rem', color: 'var(--text-sub)',
              background: 'var(--bg-hover)', borderRadius: '6px',
              padding: '6px 10px', wordBreak: 'break-all', fontFamily: 'var(--font-mono)',
            }}>
              {shortNpub}
            </code>
            <button onClick={handleCopyNpub} style={btn}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Seed phrase */}
        <div style={sectionDivider}>
          <span style={labelStyle}>Секретный ключ</span>

          {seedRevealed ? (
            <div>
              <div style={{
                background: 'var(--bg-hover)', border: '1px solid var(--line)',
                borderRadius: '8px', padding: '12px',
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px',
                marginBottom: '1rem',
              }}>
                {seedRevealed.split(' ').map((word, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--text-faint)', fontSize: '0.65rem' }}>{i + 1}. </span>
                    {word}
                  </div>
                ))}
              </div>
              <button onClick={() => setSeedRevealed('')} style={btn}>Скрыть</button>
            </div>
          ) : showPasswordInput ? (
            <div>
              <p style={{ fontSize: '0.75rem', color: passwordError ? '#f87171' : 'var(--text-sub)', margin: '0 0 10px' }}>
                {passwordError || passwordHint}
              </p>
              <input
                style={inputStyle}
                type="password"
                placeholder="Ваш пароль"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUnlockWithPassword()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button onClick={handleUnlockWithPassword} style={btnAccent}>Показать</button>
                <button onClick={() => { setShowPasswordInput(false); setPasswordError(''); setPasswordHint(''); setPasswordInput(''); }} style={btn}>Отмена</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Seed-фраза — это единственный способ восстановить доступ. Никогда не передавайте её посторонним.
              </p>
              <button
                onClick={handleRevealSeed}
                style={{ ...btn, borderColor: '#f87171', color: '#f87171' }}
              >
                Показать seed-фразу
              </button>
            </div>
          )}
        </div>

        {/* Sync */}
        <div style={sectionDivider}>
          <SyncRelaysPanel />
        </div>

        {/* Data management */}
        <div>
          <span style={labelStyle}>Утилиты</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={onExport} style={btn}>↑ Экспорт данных</button>
            <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              ↓ Импорт
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={onImport} />
            </label>
            <button 
              onClick={() => { logout(); onClose(); }}
              style={{ ...btn, color: '#f87171', borderColor: '#f87171' }}
            >
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
