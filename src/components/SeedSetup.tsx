import { useState } from 'react';
import { generateMnemonic, validateMnemonic } from '../crypto';

interface Props {
  onComplete: (mnemonic: string, password: string | null) => void;
  onRecover: () => void;
}

type Step = 'welcome' | 'generate' | 'confirm' | 'password';

export default function SeedSetup({ onComplete, onRecover }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [mnemonicData, setMnemonicData] = useState<{ mnemonic: string; words: string[]; confirmIndices: number[] } | null>(null);
  
  const handleGenerate = () => {
    const m = generateMnemonic();
    const w = m.split(' ');
    const indices: number[] = [];
    while (indices.length < 3) {
      const i = Math.floor(Math.random() * 12);
      if (!indices.includes(i)) indices.push(i);
    }
    setMnemonicData({ mnemonic: m, words: w, confirmIndices: indices.sort((a, b) => a - b) });
    setStep('generate');
  };

  const [confirmInputs, setConfirmInputs] = useState<Record<number, string>>({});
  const [confirmError, setConfirmError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopySeed = () => {
    if (!mnemonicData) return;
    navigator.clipboard.writeText(mnemonicData.mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = () => {
    if (!mnemonicData) return;
    const allCorrect = mnemonicData.confirmIndices.every(i => confirmInputs[i]?.trim().toLowerCase() === mnemonicData.words[i]);
    if (!allCorrect) {
      setConfirmError('Слова введены неверно. Проверьте и попробуйте снова.');
      return;
    }
    setConfirmError('');
    setStep('password');
  };

  const handleFinish = () => {
    if (!mnemonicData) return;
    if (password && password !== passwordConfirm) {
      setPasswordError('Пароли не совпадают');
      return;
    }
    onComplete(mnemonicData.mnemonic, password || null);
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

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)', color: 'var(--bg)', border: 'none', borderRadius: '8px',
    padding: '0.9rem 1.5rem', fontSize: '14px', cursor: 'pointer',
    fontFamily: 'inherit', width: '100%', marginTop: '1rem', fontWeight: 600,
    transition: 'opacity 0.15s, transform 0.1s',
  };

  const btnSecondary: React.CSSProperties = {
    ...btnStyle, background: 'transparent', border: '1px solid var(--line)',
    color: 'var(--text-sub)', marginTop: '0.75rem',
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px',
    padding: '0.7rem 0.85rem', color: 'var(--text)', fontFamily: 'var(--font-mono)',
    fontSize: '14px', width: '100%', outline: 'none',
  };

  if (step === 'welcome') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.04em', margin: 0, color: 'var(--text)' }}>
              Sheafy
            </h1>
            <div style={{ height: '2px', width: '40px', background: 'var(--accent)', margin: '12px auto' }} />
          </div>
          
          <p style={{ color: 'var(--text-sub)', fontSize: '15px', lineHeight: 1.6, marginBottom: '2.5rem' }}>
             Ваш личный поток мыслей в зашифрованном виде. <br/> Полная приватность и контроль над данными.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button style={btnStyle} onClick={handleGenerate}>
              Создать новое хранилище
            </button>
            <button style={btnSecondary} onClick={onRecover}>
              У меня уже есть seed-фраза
            </button>
          </div>
          
          <p style={{ marginTop: '2.5rem', fontSize: '11px', color: 'var(--text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Private • Decentralized • Encrypted
          </p>
        </div>
      </div>
    );
  }

  if (step === 'generate' && mnemonicData) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
            Секретная фраза
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Запишите эти 12 слов. Это единственный способ восстановить доступ к вашим заметкам, если вы смените браузер.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1.5rem' }}>
            {mnemonicData.words.map((word, i) => (
              <div key={i} style={{
                background: 'var(--bg-hover)', borderRadius: '8px', padding: '0.6rem',
                fontSize: '13px', textAlign: 'center', border: '1px solid var(--line)',
                fontFamily: 'var(--font-mono)', color: 'var(--text)',
              }}>
                <span style={{ color: 'var(--text-faint)', fontSize: '10px', display: 'block', marginBottom: '2px' }}>{i + 1}</span>
                {word}
              </div>
            ))}
          </div>
          <button style={btnStyle} onClick={() => setStep('confirm')}>
            Я сохранил фразу
          </button>
          <button style={btnSecondary} onClick={handleCopySeed}>
            {copied ? '✓ Скопировано' : 'Скопировать фразу'}
          </button>
          <button style={btnSecondary} onClick={() => setStep('welcome')}>
            Назад
          </button>
        </div>
      </div>
    );
  }

  if (step === 'confirm' && mnemonicData) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>Проверка безопасности</h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '1.5rem' }}>
            Подтвердите, что вы сохранили фразу, введя слова:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
            {mnemonicData.confirmIndices.map(i => (
              <div key={i}>
                <label style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '6px', display: 'block', fontWeight: 600 }}>
                  СЛОВО №{i + 1}
                </label>
                <input
                  style={inputStyle}
                  value={confirmInputs[i] || ''}
                  onChange={e => setConfirmInputs(prev => ({ ...prev, [i]: e.target.value }))}
                  autoFocus={i === mnemonicData.confirmIndices[0]}
                />
              </div>
            ))}
          </div>
          {confirmError && <p style={{ color: '#f87171', fontSize: '13px', marginTop: '0.5rem' }}>{confirmError}</p>}
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
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '1rem' }}>
          Установите пароль для быстрого входа. Без пароля вход будет автоматическим.
        </p>
        {!password && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem',
            fontSize: '12px', lineHeight: 1.5, color: 'var(--text-sub)',
          }}>
            Без пароля seed-фраза хранится в браузере в открытом виде. Любое расширение браузера или физический доступ к устройству позволит прочитать её. Рекомендуем установить пароль.
          </div>
        )}
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
