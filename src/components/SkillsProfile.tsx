import React, { useEffect, useState, useRef } from 'react';
import { useSkillStats } from '../db/useSkillStats';
import { useStreak } from '../hooks/useStreak';
import { useCrypto } from '../crypto/CryptoContext';
import { MAX_FREEZES, MULTIPLIER_CAP } from '../utils/streak';
import { IconX, StreakFlame, FreezeCrystal, XpBolt } from './icons';

interface SkillsProfileProps {
  onClose: () => void;
}

// XP → level: each level costs 100 * level XP.
function levelFor(xp: number): { level: number; intoLevel: number; nextCost: number } {
  let level = 1;
  let remaining = xp;
  while (true) {
    const cost = 100 * level;
    if (remaining < cost) return { level, intoLevel: remaining, nextCost: cost };
    remaining -= cost;
    level += 1;
  }
}

const SkillsProfile: React.FC<SkillsProfileProps> = ({ onClose }) => {
  const { totals, grandTotalXp } = useSkillStats();
  const streak = useStreak();
  const { nickname, setNickname } = useCrypto();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(nickname);
  const nameRef = useRef<HTMLInputElement>(null);

  const { level: userLevel, intoLevel: userInto, nextCost: userNext } = levelFor(grandTotalXp);
  const userPct = Math.min(100, (userInto / userNext) * 100);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (editingName) cancelEdit(); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editingName]);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  const submitName = () => {
    const v = nameInput.trim();
    if (v) setNickname(v);
    setEditingName(false);
  };

  const cancelEdit = () => {
    setNameInput(nickname);
    setEditingName(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          width: '100%', maxWidth: '560px', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          color: 'var(--text)', fontFamily: 'var(--font-body)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* ── Header: avatar + nickname + close ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '16px 20px', borderBottom: '1px solid var(--line)',
        }}>
          {/* Avatar */}
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent-bg)', border: '1px solid var(--line-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
          }}>
            {nickname.slice(0, 2).toUpperCase()}
          </div>

          {/* Nickname (editable) */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <input
                ref={nameRef}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={submitName}
                onKeyDown={e => { if (e.key === 'Enter') submitName(); if (e.key === 'Escape') cancelEdit(); }}
                style={{
                  fontSize: '1rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                  background: 'var(--bg-hover)', border: '1px solid var(--accent)',
                  borderRadius: '6px', color: 'var(--text)', padding: '3px 8px',
                  outline: 'none', width: '100%',
                }}
              />
            ) : (
              <div
                onClick={() => { setNameInput(nickname); setEditingName(true); }}
                title="Нажми чтобы изменить"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'text' }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{nickname}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)', letterSpacing: '0.04em' }}>✎</span>
              </div>
            )}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: '1px' }}>
              Профиль
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
            <IconX size={16} />
          </button>
        </div>

        {/* ── User level block ── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          {/* Level + XP */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', lineHeight: 1 }}>
              LVL {userLevel}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
              {grandTotalXp} XP всего
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: '5px', borderRadius: '3px', background: 'var(--line)', overflow: 'hidden', marginBottom: '6px' }}>
            <div style={{
              height: '100%', width: `${userPct}%`,
              background: 'var(--accent)',
              borderRadius: '3px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {userInto} / {userNext} XP
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              до LVL {userLevel + 1}
            </span>
          </div>
        </div>

        {/* ── Streak block ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: '1px', background: 'var(--line)',
          borderBottom: '1px solid var(--line)',
        }}>
          {/* Flame */}
          <div style={{ background: 'var(--bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <StreakFlame size={18} active={streak.state.current > 0} />
              <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1 }}>
                {streak.state.current}
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>
              дней подряд
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              рекорд: {streak.state.longest}
            </span>
          </div>

          {/* Freeze */}
          <div style={{ background: 'var(--bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FreezeCrystal size={18} active={streak.state.freezes > 0} />
              <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1 }}>
                {streak.state.freezes}
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>
              заморозок
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              макс {MAX_FREEZES} · +1 / 7 дн.
            </span>
          </div>

          {/* XP bonus */}
          <div style={{ background: 'var(--bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <XpBolt size={18} active={streak.multiplier > 0} />
              <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: streak.multiplier > 0 ? '#4ade80' : 'var(--text-faint)', lineHeight: 1 }}>
                +{streak.multiplier}%
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>
              бонус к XP
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {streak.multiplier >= MULTIPLIER_CAP ? 'максимум' : `до +${MULTIPLIER_CAP}%`}
            </span>
          </div>
        </div>

        {/* ── Skills list ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {totals.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.85rem' }}>
              Пока пусто. Привяжи навык к карточке через 🎯 в редакторе и отметь её как done — XP начнёт капать сюда.
            </div>
          )}
          {totals.map(t => {
            const { level, intoLevel, nextCost } = levelFor(t.totalXp);
            const pct = Math.min(100, (intoLevel / nextCost) * 100);
            return (
              <div key={t.name} style={{
                display: 'flex', flexDirection: 'column', gap: '5px',
                padding: '12px 8px', borderBottom: '1px solid var(--line)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {t.name}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>
                      lvl {level} · {t.doneCount} done
                    </span>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                    {t.totalXp} XP
                  </span>
                </div>
                <div style={{ height: '4px', background: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: 'var(--accent)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    {intoLevel} / {nextCost} XP
                  </span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    до lvl {level + 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SkillsProfile;
