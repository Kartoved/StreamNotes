import { useState } from 'react';
import { validateMnemonic } from '../crypto';

interface Props {
  onComplete: (mnemonic: string, password: string | null) => void;
  onBack: () => void;
}

export default function SeedRecover({ onComplete, onBack }: Props) {
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'password'>('input');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [mnemonic, setMnemonic] = useState('');

  const handleValidate = () => {
    const m = words.map(w => w.trim().toLowerCase()).join(' ');
    if (!validateMnemonic(m)) {
      setError('Неверная seed-фраза. Проверьте слова и попробуйте снова.');
      return;
    }
    setMnemonic(m);
    setError('');
    setStep('password');
  };

  const handleFinish = () => {
    if (password && password !== passwordConfirm) {
      setPasswordError('Пароли не совпадают');
      return;
    }
    onComplete(mnemonic, password || null);
  };

  const handlePaste = (e: React.ClipboardEvent, index: number) => {
    const text = e.clipboardData.getData('text').trim();
    const pastedWords = text.split(/\s+/);
    if (pastedWords.length > 1) {
      e.preventDefault();
      const newWords = [...words];
      for (let i = 0; i < pastedWords.length && index + i < 12; i++) {
        newWords[index + i] = pastedWords[i];
      }
      setWords(newWords);
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
    maxWidth: '480px', width: '100%', boxShadow: 'var(--shadow-lg)',
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px',
    padding: '0.7rem 0.85rem', color: 'var(--text)', fontFamily: 'var(--font-mono)',
    fontSize: '13px', width: '100%', outline: 'none',
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)', color: 'var(--bg)', border: 'none', borderRadius: '8px',
    padding: '0.9rem 1.5rem', fontSize: '14px', cursor: 'pointer',
    fontFamily: 'inherit', width: '100%', marginTop: '1rem', fontWeight: 600,
  };

  const btnSecondary: React.CSSProperties = {
    ...btnStyle, background: 'transparent', border: '1px solid var(--line)',
    color: 'var(--text-sub)', marginTop: '0.75rem',
  };

  if (step === 'input') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>Восстановление</h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '1.5rem' }}>
            Введите вашу seed-фразу из 12 слов:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1.5rem' }}>
            {words.map((word, i) => (
              <div key={i}>
                <label style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>{i + 1}</label>
                <input
                  style={inputStyle}
                  value={word}
                  onChange={e => {
                    const newWords = [...words];
                    newWords[i] = e.target.value;
                    setWords(newWords);
                  }}
                  onPaste={e => handlePaste(e, i)}
                  autoFocus={i === 0}
                />
              </div>
            ))}
          </div>
          {error && <p style={{ color: '#f87171', fontSize: '13px', marginTop: '0.5rem' }}>{error}</p>}
          <button style={btnStyle} onClick={handleValidate}>Восстановить</button>
          <button style={btnSecondary} onClick={onBack}>Назад</button>
        </div>
      </div>
    );
  }

  // step === 'password'
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>Установка пароля</h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '1.5rem' }}>
          Установите пароль для быстрого входа на этом устройстве.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
          <input
            style={inputStyle}
            type="password"
            placeholder="Новый пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {password && (
            <input
              style={inputStyle}
              type="password"
              placeholder="Подтвердите пароль"
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
            />
          )}
        </div>
        {passwordError && <p style={{ color: '#f87171', fontSize: '13px' }}>{passwordError}</p>}
        <button style={btnStyle} onClick={handleFinish}>
          {password ? 'Завершить настройку' : 'Войти без пароля'}
        </button>
      </div>
    </div>
  );
}
