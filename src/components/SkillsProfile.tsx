import React, { useEffect } from 'react';
import { useSkillStats } from '../db/useSkillStats';
import { useStreak } from '../hooks/useStreak';
import { MAX_FREEZES, MULTIPLIER_CAP } from '../utils/streak';
import { IconX, IconFlame, IconSnowflake } from './icons';

interface SkillsProfileProps {
  onClose: () => void;
}

// XP → level: each level costs 100 * level XP. Cheap, replaceable.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.55)',
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
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          color: 'var(--text)',
          fontFamily: 'var(--font-body)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', borderBottom: '1px solid var(--line)',
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Профиль
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '2px' }}>
              Навыки
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-faint)', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          ><IconX size={18} /></button>
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: '10px',
          padding: '16px 20px', borderBottom: '1px solid var(--line)',
        }}>
          <span style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
            {grandTotalXp}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
            суммарно XP по всем навыкам
          </span>
        </div>

        {/* Streak panel */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          padding: '14px 20px', borderBottom: '1px solid var(--line)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <IconFlame size={20} />{streak.state.current}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
              {streak.state.current === 1 ? 'день' : 'дней подряд'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.72rem', color: 'var(--text-sub)', fontFamily: 'var(--font-mono)' }}>
            <span>рекорд: <strong style={{ color: 'var(--text)' }}>{streak.state.longest}</strong></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><IconSnowflake size={11} /> заморозок: <strong style={{ color: 'var(--text)' }}>{streak.state.freezes}/{MAX_FREEZES}</strong> <span style={{ color: 'var(--text-faint)' }}>(+1 каждые 7 дн.)</span></span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: streak.multiplier > 0 ? 'var(--text)' : 'var(--text-faint)' }}>
              +{streak.multiplier}%
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>
              бонус к XP {streak.multiplier >= MULTIPLIER_CAP ? '(макс)' : `· до +${MULTIPLIER_CAP}%`}
            </span>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {totals.length === 0 && (
            <div style={{
              padding: '40px 20px', textAlign: 'center',
              color: 'var(--text-faint)', fontSize: '0.85rem',
            }}>
              Пока пусто. Привяжи навык к карточке через 🎯 в редакторе и отметь её как done — XP начнёт капать сюда.
            </div>
          )}
          {totals.map(t => {
            const { level, intoLevel, nextCost } = levelFor(t.totalXp);
            const pct = Math.min(100, (intoLevel / nextCost) * 100);
            return (
              <div key={t.name} style={{
                display: 'flex', flexDirection: 'column', gap: '4px',
                padding: '10px 8px', borderBottom: '1px solid var(--line)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {t.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                      lvl {level} · {t.doneCount} done
                    </span>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>
                    {t.totalXp} XP
                  </span>
                </div>
                <div style={{
                  height: '4px', background: 'var(--bg-hover)',
                  borderRadius: '2px', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: '#bd93f9',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {intoLevel}/{nextCost} до lvl {level + 1}
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
