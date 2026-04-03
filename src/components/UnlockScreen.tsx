import { useState } from 'react';

interface Props {
  onUnlock: (password: string) => boolean;
  onRecover: () => void;
}

export default function UnlockScreen({ onUnlock, onRecover }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
    fontFamily: "var(--font-body)", color: 'var(--text)',
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

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          StreamNotes
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '13px', marginBottom: '2rem' }}>
          Введите пароль для разблокировки
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              style={inputStyle}
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
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
