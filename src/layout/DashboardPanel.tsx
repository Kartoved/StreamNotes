import React from 'react';
import type { DashboardStats } from '../db/useDashboardStats';
import { PomodoroState, PomodoroActions, formatPomodoroTime } from '../hooks/usePomodoro';

// ── Progress Ring ─────────────────────────────────────────────────────
const ProgressRing = ({ done, total, size = 72 }: { done: number; total: number; size?: number }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const dash = pct * circ;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--text)" strokeWidth="5"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
    </svg>
  );
};

// ── Pomodoro Ring ─────────────────────────────────────────────────────
const PomodoroRing = ({ secondsLeft, totalSecs, size = 64, phase }: {
  secondsLeft: number; totalSecs: number; size?: number; phase: string;
}) => {
  const sw = size >= 100 ? 6 : 4;
  const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = totalSecs > 0 ? secondsLeft / totalSecs : 0;
  const dash = pct * circ;
  const color = phase === 'work' ? 'var(--text)' : 'var(--text-sub)';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s linear' }} />
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
  stats: DashboardStats;
  pomodoro: PomodoroState;
  pomodoroActions: PomodoroActions;
}

const PHASE_TOTAL: Record<string, number> = {
  work: 25 * 60,
  break: 5 * 60,
  longBreak: 15 * 60,
  idle: 25 * 60,
};

const PHASE_LABEL: Record<string, string> = {
  work: 'Работа',
  break: 'Перерыв',
  longBreak: 'Длинный перерыв',
  idle: 'Готов',
};

export const DashboardPanel = ({
  activeStatusFilter, onStatusFilter, stats,
  pomodoro, pomodoroActions,
}: DashboardPanelProps) => {
  const { todoToday, doingToday, doneToday, totalToday, somedayCount, futureCount } = stats;

  const today = new Date();
  const dateLabel = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  const handleClick = (status: string) => {
    const next = activeStatusFilter === status ? null : status;
    onStatusFilter(next);
  };

  const totalSecs = PHASE_TOTAL[pomodoro.phase] ?? PHASE_TOTAL.idle;

  return (
    <div className="dashboard-panel" style={{
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
        <StatRow label="Нужно сделать" count={todoToday} active={activeStatusFilter === 'todo'} onClick={() => handleClick('todo')} />
        <StatRow label="В процессе" count={doingToday} active={activeStatusFilter === 'doing'} onClick={() => handleClick('doing')} />
        <StatRow label="Выполнено" count={doneToday} active={activeStatusFilter === 'done'} onClick={() => handleClick('done')} />
        <div style={{ height: '1px', background: 'var(--line)', margin: '4px 4px 8px 4px' }} />
        <StatRow label="Неразобранные" count={somedayCount} active={activeStatusFilter === 'todo-no-date'} onClick={() => handleClick('todo-no-date')} />
        <StatRow label="Будущие" count={futureCount} active={activeStatusFilter === 'todo-future'} onClick={() => handleClick('todo-future')} />
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
              margin: '0 4px', transition: 'all 0.1s',
            }}
          >
            Сбросить фильтр
          </button>
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--line)', margin: '0 4px' }} />

      {/* ── Pomodoro ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '8px 4px 4px' }}>

        {/* Title + status */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Помидор
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>
            {pomodoro.phase === 'idle' ? '' : pomodoro.isRunning ? PHASE_LABEL[pomodoro.phase] : 'Пауза'}
          </span>
        </div>

        {/* Large ring */}
        <div style={{ position: 'relative' }}>
          <PomodoroRing
            secondsLeft={pomodoro.secondsLeft}
            totalSecs={totalSecs}
            size={120}
            phase={pomodoro.phase}
          />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '2px',
          }}>
            <span style={{
              fontSize: '1.45rem', fontWeight: 700,
              color: 'var(--text)', fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.03em', lineHeight: 1,
            }}>
              {formatPomodoroTime(pomodoro.secondsLeft)}
            </span>
          </div>
        </div>

        {/* Session dots (4 per cycle) */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {[0, 1, 2, 3].map(i => {
            const filled = i < (pomodoro.sessionCount % 4) || (pomodoro.sessionCount > 0 && pomodoro.sessionCount % 4 === 0 && i < 4);
            return (
              <div key={i} style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: filled ? 'var(--text)' : 'var(--line)',
                transition: 'background 0.3s',
              }} />
            );
          })}
        </div>

        {/* Control buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {pomodoro.phase === 'idle' ? (
            <button onClick={() => pomodoroActions.start()} style={iconBtnStyle(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          ) : pomodoro.isRunning ? (
            <button onClick={pomodoroActions.pause} style={iconBtnStyle(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            </button>
          ) : (
            <button onClick={pomodoroActions.resume} style={iconBtnStyle(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}
          {pomodoro.phase !== 'idle' && (
            <button onClick={pomodoroActions.reset} style={iconBtnStyle(false)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* Task */}
        {pomodoro.taskTitle ? (
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
            <span style={{
              fontSize: '0.65rem', color: 'var(--text-sub)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '120px',
            }} title={pomodoro.taskTitle}>
              {pomodoro.taskTitle}
            </span>
            <button onClick={() => pomodoroActions.reset()} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0, fontSize: '0.7rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        ) : (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)', cursor: 'default' }}>
            {pomodoro.phase === 'idle' ? 'Задача не выбрана' : ''}
          </span>
        )}

        {/* Completed today */}
        <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', textAlign: 'center' }}>
          {pomodoro.completedToday} выполнено сегодня
        </div>
      </div>
    </div>
  );
};

function iconBtnStyle(primary: boolean): React.CSSProperties {
  return {
    width: '32px', height: '32px',
    borderRadius: '50%',
    border: primary ? 'none' : '1px solid var(--line)',
    background: primary ? 'var(--text)' : 'transparent',
    color: primary ? 'var(--bg)' : 'var(--text-faint)',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
    flexShrink: 0,
  };
}
