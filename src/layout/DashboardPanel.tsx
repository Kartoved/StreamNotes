import React from 'react';
import { useDashboardStats } from '../db/useDashboardStats';

// ── Progress Ring ─────────────────────────────────────────────────────
const ProgressRing = ({ done, total, size = 72 }: { done: number; total: number; size?: number }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const dash = pct * circ;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="var(--line)"
        strokeWidth="5"
      />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="var(--text)"
        strokeWidth="5"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
};

// ── Stat Row ──────────────────────────────────────────────────────────
const StatRow = ({
  label, count, active, onClick,
}: {
  label: string; count: number; active?: boolean; onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 8px', borderRadius: 'var(--radius)',
      cursor: onClick ? 'pointer' : 'default',
      background: active ? 'var(--bg-active)' : 'transparent',
      transition: 'background 0.1s',
      userSelect: 'none',
    }}
    onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = active ? 'var(--bg-active)' : 'var(--bg-hover)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? 'var(--bg-active)' : 'transparent'; }}
  >
    <span style={{ fontSize: '0.75rem', color: 'var(--text-sub)', letterSpacing: '0.02em' }}>{label}</span>
    <span style={{
      fontSize: '0.9rem', fontWeight: 600, color: active ? 'var(--text)' : 'var(--text-sub)',
      minWidth: '20px', textAlign: 'right', fontFamily: 'var(--font-mono)',
    }}>{count}</span>
  </div>
);

// ── Dashboard Panel ───────────────────────────────────────────────────
interface DashboardPanelProps {
  activeStatusFilter: string | null;
  onStatusFilter: (status: string | null) => void;
  activeFeedId: string | null;
}

export const DashboardPanel = ({ activeStatusFilter, onStatusFilter, activeFeedId }: DashboardPanelProps) => {
  const { todoToday, doingToday, doneToday, totalToday, somedayCount, futureCount } = useDashboardStats(activeFeedId);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  const handleClick = (status: string) => {
    const next = activeStatusFilter === status ? null : status;
    onStatusFilter(next);
  };

  return (
    <div style={{
      width: '180px', flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--line)',
      background: 'var(--bg)',
      padding: '14px 10px',
      gap: '12px',
      overflowY: 'auto',
    }}>
      {/* Date label */}
      <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingLeft: '8px' }}>
        Сегодня · {dateLabel}
      </div>

      {/* Ring + numbers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 4px' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ProgressRing done={doneToday} total={totalToday || 1} size={64} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '0',
          }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {doneToday}
            </span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-faint)', lineHeight: 1 }}>
              /{totalToday}
            </span>
          </div>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)', lineHeight: 1.5 }}>
          {totalToday === 0
            ? 'Нет дел\nна сегодня'
            : `${doneToday} из ${totalToday}\nвыполнено`}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--line)', margin: '0 4px' }} />

      {/* Stat rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <StatRow
          label="Нужно сделать"
          count={todoToday}
          active={activeStatusFilter === 'todo'}
          onClick={() => handleClick('todo')}
        />
        <StatRow
          label="В процессе"
          count={doingToday}
          active={activeStatusFilter === 'doing'}
          onClick={() => handleClick('doing')}
        />
        <StatRow
          label="Выполнено"
          count={doneToday}
          active={activeStatusFilter === 'done'}
          onClick={() => handleClick('done')}
        />

        <div style={{ height: '1px', background: 'var(--line)', margin: '4px 4px 8px 4px' }} />
        
        <StatRow
          label="Неразобранные"
          count={somedayCount}
          active={activeStatusFilter === 'todo-no-date'}
          onClick={() => handleClick('todo-no-date')}
        />
        <StatRow
          label="Будущие"
          count={futureCount}
          active={activeStatusFilter === 'todo-future'}
          onClick={() => handleClick('todo-future')}
        />
      </div>

      {/* Clear filter */}
      {activeStatusFilter && (
        <>
          <div style={{ height: '1px', background: 'var(--line)', margin: '0 4px' }} />
          <button
            onClick={() => onStatusFilter(null)}
            style={{
              background: 'transparent', border: '1px solid var(--line)',
              borderRadius: 'var(--radius)', color: 'var(--text-sub)',
              fontSize: '0.72rem', padding: '4px 8px',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              margin: '0 4px',
              transition: 'all 0.1s',
            }}
          >
            Сбросить фильтр
          </button>
        </>
      )}
    </div>
  );
};
