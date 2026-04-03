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
    background: 'var(--bg-color)', backgroundImage: 'var(--bg-gradient)', backgroundAttachment: 'fixed',
    fontFamily: "'Source Code Pro', 'Courier New', monospace", color: 'var(--text-main)',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--border)', borderRadius: '16px', padding: '2rem',
    maxWidth: '400px', width: '100%', boxShadow: '0 4px 30px rgba(0,0,0,0.1)',
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '0.75rem', color: 'var(--text-main)', fontFamily: 'inherit',
    fontSize: '14px', width: '100%',
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '0.75rem 1.5rem', fontSize: '14px', cursor: 'pointer',
    fontFamily: 'inherit', width: '100%', marginTop: '1rem',
  };

  const btnSecondary: React.CSSProperties = {
    ...btnStyle, background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-muted)',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '20px', background: 'linear-gradient(45deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          StreamNotes
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '1.5rem' }}>
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
