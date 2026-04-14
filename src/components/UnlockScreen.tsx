import { useState, useEffect, useRef } from 'react';
import { isBiometricEnrolled, isBiometricSupported } from '../crypto/biometric';

interface Props {
  onUnlock: (password: string) => boolean;
  onBiometricUnlock?: () => Promise<boolean>;
  onRecover: () => void;
}

export default function UnlockScreen({ onUnlock, onBiometricUnlock, onRecover }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const autoTriggeredRef = useRef(false);

  const enrolled = isBiometricEnrolled();

  // Check if the device actually supports biometric
  useEffect(() => {
    if (!enrolled || !onBiometricUnlock) return;
    isBiometricSupported().then(setBioAvailable);
  }, [enrolled, onBiometricUnlock]);

  // Auto-trigger fingerprint on mount if enrolled
  useEffect(() => {
    if (!bioAvailable || autoTriggeredRef.current || !onBiometricUnlock) return;
    autoTriggeredRef.current = true;
    const timer = setTimeout(() => triggerBiometric(), 400);
    return () => clearTimeout(timer);
  }, [bioAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerBiometric = async () => {
    if (!onBiometricUnlock || bioLoading) return;
    setBioLoading(true);
    setError('');
    try {
      const ok = await onBiometricUnlock();
      if (!ok) setError('Биометрия не сработала — введите пароль');
    } finally {
      setBioLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onUnlock(password);
    if (!ok) {
      setError('Неверный пароль');
      setPassword('');
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', padding: '2rem',
    background: 'var(--bg)',
    fontFamily: 'var(--font-body)', color: 'var(--text)',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--line)', borderRadius: '16px', padding: '2.5rem 2rem',
    maxWidth: '400px', width: '100%', boxShadow: '0 4px 30px rgba(0,0,0,0.1)',
    textAlign: 'center',
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px',
    padding: '0.75rem', color: 'var(--text)', fontFamily: 'var(--font-mono)',
    fontSize: '14px', width: '100%', outline: 'none', textAlign: 'center',
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)', color: 'var(--bg)', border: 'none', borderRadius: '8px',
    padding: '0.75rem 1.5rem', fontSize: '14px', cursor: 'pointer',
    fontFamily: 'var(--font-body)', width: '100%', marginTop: '1.5rem', fontWeight: 600,
  };

  const btnSecondary: React.CSSProperties = {
    background: 'transparent', border: 'none',
    color: 'var(--text-faint)', fontSize: '12px', cursor: 'pointer',
    fontFamily: 'var(--font-body)', marginTop: '1rem',
  };

  const btnBio: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
    background: 'transparent', border: '1px solid var(--line)',
    color: 'var(--text)', borderRadius: '8px',
    padding: '0.75rem 1.5rem', fontSize: '14px', cursor: bioLoading ? 'default' : 'pointer',
    fontFamily: 'var(--font-body)', width: '100%', marginTop: '1.5rem', fontWeight: 500,
    opacity: bioLoading ? 0.6 : 1,
    transition: 'opacity 0.15s',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Sheafy
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '13px', marginBottom: '2rem' }}>
          Введите пароль для разблокировки
        </p>

        {/* Biometric button — only shown if enrolled + supported */}
        {enrolled && bioAvailable && onBiometricUnlock && (
          <button style={btnBio} onClick={triggerBiometric} disabled={bioLoading}>
            <FingerprintIcon />
            {bioLoading ? 'Ожидание...' : 'Войти по отпечатку'}
          </button>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: enrolled && bioAvailable ? '1.5rem' : 0 }}>
          {enrolled && bioAvailable && (
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '12px' }}>
              или введите пароль вручную
            </div>
          )}
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              style={inputStyle}
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus={!bioAvailable}
              id="unlock-password"
              name="unlock-password"
            />
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0.5rem 0 0' }}>{error}</p>}
          <button type="submit" style={btnStyle}>Разблокировать</button>
        </form>

        <button style={btnSecondary} onClick={onRecover}>
          Восстановить по seed-фразе
        </button>
      </div>
    </div>
  );
}

function FingerprintIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 3.5"/>
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88"/>
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/>
      <path d="M2 12a10 10 0 0 1 18-6"/>
      <path d="M2 17c1.24 1.64 2.97 2.83 5 3.31"/>
      <path d="M2 8c1.36-2.31 3.46-4.06 6-5"/>
      <path d="M5 11.5a7 7 0 0 1 14 0"/>
      <path d="M8.69 14a12.61 12.61 0 0 0 .6 6"/>
    </svg>
  );
}
