import { useState } from 'react';
import { generateMnemonic, validateMnemonic } from '../crypto';

interface Props {
  onComplete: (mnemonic: string, password: string | null) => void;
  onRecover: () => void;
}

type Step = 'generate' | 'confirm' | 'password';

export default function SeedSetup({ onComplete, onRecover }: Props) {
  // Generate everything atomically so mnemonic and confirmIndices are always in sync
  const [{ mnemonic, words, confirmIndices }] = useState(() => {
    const m = generateMnemonic();
    const w = m.split(' ');
    const indices: number[] = [];
    while (indices.length < 3) {
      const i = Math.floor(Math.random() * 12);
      if (!indices.includes(i)) indices.push(i);
    }
    return { mnemonic: m, words: w, confirmIndices: indices.sort((a, b) => a - b) };
  });

  const [step, setStep] = useState<Step>('generate');
  const [confirmInputs, setConfirmInputs] = useState<Record<number, string>>({});
  const [confirmError, setConfirmError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleConfirm = () => {
    const allCorrect = confirmIndices.every(i => confirmInputs[i]?.trim().toLowerCase() === words[i]);
    if (!allCorrect) {
      setConfirmError('Слова введены неверно. Проверьте и попробуйте снова.');
      return;
    }
    setConfirmError('');
    setStep('password');
  };

  const handleFinish = () => {
    if (password && password !== passwordConfirm) {
      setPasswordError('Пароли не совпадают');
      return;
    }
    onComplete(mnemonic, password || null);
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
    maxWidth: '480px', width: '100%', boxShadow: '0 4px 30px rgba(0,0,0,0.1)',
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

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '0.5rem 0.75rem', color: 'var(--text-main)', fontFamily: 'inherit',
    fontSize: '14px', width: '100%',
  };

  if (step === 'generate') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '20px', background: 'linear-gradient(45deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            StreamNotes
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '1.5rem' }}>
            Ваша секретная фраза из 12 слов. Запишите её в надёжное место. Это единственный способ восстановить доступ к данным.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {words.map((word, i) => (
              <div key={i} style={{
                background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.5rem',
                fontSize: '13px', textAlign: 'center',
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{i + 1}. </span>
                {word}
              </div>
            ))}
          </div>
          <button style={btnStyle} onClick={() => setStep('confirm')}>
            Я сохранил фразу
          </button>
          <button style={btnSecondary} onClick={onRecover}>
            У меня уже есть фраза
          </button>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '20px' }}>Подтверждение</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '1.5rem' }}>
            Введите слова с указанными номерами:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            {confirmIndices.map(i => (
              <div key={i}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Слово #{i + 1}
                </label>
                <input
                  style={inputStyle}
                  value={confirmInputs[i] || ''}
                  onChange={e => setConfirmInputs(prev => ({ ...prev, [i]: e.target.value }))}
                  autoFocus={i === confirmIndices[0]}
                />
              </div>
            ))}
          </div>
          {confirmError && <p style={{ color: '#ef4444', fontSize: '13px' }}>{confirmError}</p>}
          <button style={btnStyle} onClick={handleConfirm}>Подтвердить</button>
          <button style={btnSecondary} onClick={() => setStep('generate')}>Назад</button>
        </div>
      </div>
    );
  }

  // step === 'password'
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '20px' }}>Пароль (опционально)</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '1.5rem' }}>
          Установите пароль для быстрого входа. Без пароля вход будет автоматическим.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            style={inputStyle}
            type="password"
            placeholder="Пароль"
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
        {passwordError && <p style={{ color: '#ef4444', fontSize: '13px' }}>{passwordError}</p>}
        <button style={btnStyle} onClick={handleFinish}>
          {password ? 'Установить пароль и войти' : 'Войти без пароля'}
        </button>
      </div>
    </div>
  );
}
