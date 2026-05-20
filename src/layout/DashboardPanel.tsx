import React from 'react';
import { Play, Pause, SkipForward, Coffee, RotateCcw, X } from 'lucide-react';
import type { DashboardStats } from '../db/useDashboardStats';
import { PomodoroState, PomodoroActions, formatPomodoroTime } from '../hooks/usePomodoro';
import type { StreakInfo } from '../hooks/useStreak';
import { IconX, IconTarget2, StreakFlame, FreezeCrystal, XpBolt } from '../components/icons';

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

// ── Phase color palette ───────────────────────────────────────────────
const PHASE_COLOR: Record<string, string> = {
  idle:         'var(--accent)',
  work:         '#f97316',
  overtime:     '#f59e0b',
  readyForBreak:'#60b888',
  break:        '#60b888',
  longBreak:    '#60b888',
};
const PHASE_GLOW: Record<string, string> = {
  idle:         'transparent',
  work:         'rgba(249,115,22,0.20)',
  overtime:     'rgba(245,158,11,0.22)',
  readyForBreak:'rgba(96,184,136,0.20)',
  break:        'rgba(96,184,136,0.20)',
  longBreak:    'rgba(96,184,136,0.20)',
};

// ── Pomodoro Ring ─────────────────────────────────────────────────────
const PomodoroRing = ({ secondsLeft, totalSecs, size = 120, phase }: {
  secondsLeft: number; totalSecs: number; size?: number; phase: string;
}) => {
  const sw = 6;
  const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const isOvertime = phase === 'overtime';
  const isReady = phase === 'readyForBreak';
  const pct = (isOvertime || isReady) ? 0 : (totalSecs > 0 ? secondsLeft / totalSecs : 1);
  const dash = pct * circ;
  const color = PHASE_COLOR[phase] ?? 'var(--text-faint)';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      {/* Track */}
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="var(--line)" strokeWidth={sw} />
      {/* Progress */}
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s linear, stroke 0.5s ease' }} />
    </svg>
  );
};

// ── Stat Row ──────────────────────────────────────────────────────────
const StatRow = ({
  label, count, active, onClick, accent,
}: {
  label: string; count: number; active?: boolean; onClick?: () => void; accent?: string;
}) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: '7px',
      padding: '5px 8px', borderRadius: 'var(--radius)',
      cursor: onClick ? 'pointer' : 'default',
      background: active ? 'var(--bg-active)' : 'transparent',
      transition: 'background 0.1s',
      userSelect: 'none',
    }}
    onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = active ? 'var(--bg-active)' : 'var(--bg-hover)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? 'var(--bg-active)' : 'transparent'; }}
  >
    {accent && (
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
        background: count > 0 ? accent : 'var(--text-faint)',
        opacity: count > 0 ? 1 : 0.35,
        transition: 'background 0.2s',
      }} />
    )}
    <span style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-sub)', letterSpacing: '0.01em' }}>{label}</span>
    <span style={{
      fontSize: '0.88rem', fontWeight: 700,
      color: count > 0 && accent ? accent : active ? 'var(--text)' : 'var(--text-faint)',
      minWidth: '20px', textAlign: 'right', fontFamily: 'var(--font-mono)',
      transition: 'color 0.2s',
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
  streak: StreakInfo;
  onOpenSkills?: () => void;
}

const PHASE_TOTAL: Record<string, number> = {
  work: 25 * 60,
  overtime: 25 * 60,
  readyForBreak: 25 * 60,
  break: 5 * 60,
  longBreak: 15 * 60,
  idle: 25 * 60,
};

const PHASE_LABEL: Record<string, string> = {
  work: 'Работа',
  overtime: '+Время',
  readyForBreak: 'Готово!',
  break: 'Перерыв',
  longBreak: 'Длинный перерыв',
  idle: '',
};

export const DashboardPanel = ({
  activeStatusFilter, onStatusFilter, stats,
  pomodoro, pomodoroActions, streak, onOpenSkills,
}: DashboardPanelProps) => {
  const { todoToday, doingToday, doneToday, totalToday, somedayCount, futureCount } = stats;

  const today = new Date();
  const dateLabel = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const dayLabel = today.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase();

  const handleClick = (status: string) => {
    const next = activeStatusFilter === status ? null : status;
    onStatusFilter(next);
  };

  const totalSecs = PHASE_TOTAL[pomodoro.phase] ?? PHASE_TOTAL.idle;
  const isOvertime = pomodoro.phase === 'overtime';
  const isReadyForBreak = pomodoro.phase === 'readyForBreak';

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
      <div style={{ paddingLeft: '8px' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          {dayLabel}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: '6px' }}>
          {dateLabel}
        </span>
      </div>

      {/* Ring */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 4px' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ProgressRing done={doneToday} total={totalToday || 1} size={120} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
          }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {doneToday}/{totalToday}
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', lineHeight: 1, letterSpacing: '0.04em' }}>
              выполнено
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--line)', margin: '0 4px' }} />

      {/* Stat rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <StatRow label="Нужно сделать" count={todoToday} active={activeStatusFilter === 'todo'} onClick={() => handleClick('todo')} accent="#f97316" />
        <StatRow label="В процессе"    count={doingToday} active={activeStatusFilter === 'doing'} onClick={() => handleClick('doing')} accent="var(--note-accent-doing)" />
        <StatRow label="Выполнено"     count={doneToday}  active={activeStatusFilter === 'done'}  onClick={() => handleClick('done')}  accent="var(--note-accent-done)" />
        <div style={{ height: '1px', background: 'var(--line)', margin: '4px 4px 8px 4px' }} />
        <StatRow label="Неразобранные" count={somedayCount} active={activeStatusFilter === 'todo-no-date'} onClick={() => handleClick('todo-no-date')} accent="#f97316" />
        <StatRow label="Будущие"       count={futureCount}  active={activeStatusFilter === 'todo-future'}  onClick={() => handleClick('todo-future')} />
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

      {/* Profile / Skills entry */}
      {onOpenSkills && (
        <button
          onClick={onOpenSkills}
          style={{
            background: 'transparent', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', color: 'var(--text-sub)',
            fontSize: '0.72rem', padding: '6px 10px',
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            margin: '0 4px', transition: 'all 0.1s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <IconTarget2 size={13} /><span>Профиль и навыки</span>
        </button>
      )}

      {/* Streak card */}
      <button
        onClick={onOpenSkills}
        title={
          `Стрик: ${streak.state.current} дн.` +
          (streak.state.longest > streak.state.current ? ` · рекорд ${streak.state.longest}` : '') +
          `\nЗаморозок: ${streak.state.freezes}/3 (1 каждые 7 дней)` +
          `\nБонус к XP за задачи: +${streak.multiplier}%`
        }
        style={{
          background: 'var(--bg-hover)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', color: 'var(--text-sub)',
          padding: '12px 12px 10px',
          cursor: 'pointer', fontFamily: 'var(--font-body)',
          margin: '0 4px', transition: 'border-color 0.15s, background 0.15s',
          display: 'flex', flexDirection: 'column', gap: '10px',
          textAlign: 'left',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--line-strong)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
      >
        {/* Row 1: flame + big number + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StreakFlame size={22} active={streak.state.current > 0} />
          <span style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1 }}>
            {streak.state.current}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: '2px' }}>
            {streak.state.current === 1 ? 'день' : 'дней'}
          </span>
        </div>

        {/* Row 2: freeze */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
          <FreezeCrystal size={15} active={streak.state.freezes > 0} />
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{streak.state.freezes}</span>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.68rem' }}>/ 3 заморозки</span>
        </div>

        {/* Row 3: XP bolt */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
          <XpBolt size={15} active={streak.multiplier > 0} />
          <span style={{ color: streak.multiplier > 0 ? '#f59e0b' : 'var(--text-faint)', fontWeight: 700 }}>
            +{streak.multiplier}%
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.68rem' }}>бонус XP</span>
        </div>
      </button>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--line)', margin: '0 4px' }} />

      {/* ── Pomodoro ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '8px 4px 4px' }}>

        {/* Title + phase label */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Помодоро
          </span>
          {pomodoro.phase !== 'idle' && (
            <span style={{ fontSize: '0.62rem', color: PHASE_COLOR[pomodoro.phase], fontWeight: 500, letterSpacing: '0.03em' }}>
              {pomodoro.isRunning ? PHASE_LABEL[pomodoro.phase] : 'Пауза'}
            </span>
          )}
        </div>

        {/* Ring with glow */}
        <div style={{
          position: 'relative',
          borderRadius: '50%',
          boxShadow: pomodoro.phase !== 'idle' ? `0 0 28px 4px ${PHASE_GLOW[pomodoro.phase]}` : 'none',
          transition: 'box-shadow 0.6s ease',
        }}>
          <PomodoroRing secondsLeft={pomodoro.secondsLeft} totalSecs={totalSecs} size={120} phase={pomodoro.phase} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
          }}>
            {isReadyForBreak ? (
              <span style={{ fontSize: '1.6rem', color: '#60b888', lineHeight: 1 }}>✓</span>
            ) : (
              <>
                <span style={{
                  fontSize: '1.5rem', fontWeight: 700,
                  color: PHASE_COLOR[pomodoro.phase] ?? 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '-0.03em', lineHeight: 1,
                  transition: 'color 0.5s ease',
                }}>
                  {isOvertime ? '+' : ''}{formatPomodoroTime(pomodoro.secondsLeft)}
                </span>
                {pomodoro.accumulatedMinutes > 0 && (
                  <span style={{ fontSize: '0.62rem', color: '#f59e0b', fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: '2px' }}>
                    +{pomodoro.accumulatedMinutes} XP
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Session pills (4 per cycle) */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', width: '100%', padding: '0 8px' }}>
          {[0, 1, 2, 3].map(i => {
            const filled = i < (pomodoro.sessionCount % 4) || (pomodoro.sessionCount > 0 && pomodoro.sessionCount % 4 === 0 && i < 4);
            return (
              <div key={i} style={{
                flex: 1, height: '4px', borderRadius: '2px',
                background: filled ? PHASE_COLOR[pomodoro.phase === 'idle' ? 'work' : pomodoro.phase] : 'var(--line)',
                transition: 'background 0.4s',
              }} />
            );
          })}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>

          {/* Main action: big circular button */}
          {pomodoro.phase === 'idle' && (
            <button onClick={() => pomodoroActions.start()} style={primaryBtnStyle}>
              <Play size={18} strokeWidth={2} fill="currentColor" />
            </button>
          )}

          {(pomodoro.phase === 'work' || isOvertime) && (
            <>
              <button onClick={pomodoro.isRunning ? pomodoroActions.pause : pomodoroActions.resume} style={primaryBtnStyle}>
                {pomodoro.isRunning
                  ? <Pause size={18} strokeWidth={2} fill="currentColor" />
                  : <Play size={18} strokeWidth={2} fill="currentColor" />}
              </button>
              <button
                onClick={pomodoroActions.finish}
                title="Закончить"
                style={{
                  ...iconBtnStyle(isOvertime),
                  ...(isOvertime ? { background: '#f59e0b', border: 'none', color: '#000' } : {}),
                  width: '36px', height: '36px',
                }}
              >
                <SkipForward size={15} strokeWidth={2} />
              </button>
            </>
          )}

          {isReadyForBreak && (
            <>
              <button onClick={pomodoroActions.startBreak} style={{ ...secondaryBtnStyle, color: '#60b888', borderColor: 'rgba(96,184,136,0.4)' }}>
                <Coffee size={14} strokeWidth={2} />
                <span>Отдых</span>
              </button>
              <button onClick={() => pomodoroActions.start(pomodoro.taskId, pomodoro.taskTitle)} style={secondaryBtnStyle}>
                <Play size={13} strokeWidth={2} />
                <span>Ещё</span>
              </button>
            </>
          )}

          {(pomodoro.phase === 'break' || pomodoro.phase === 'longBreak') && (
            <button onClick={pomodoro.isRunning ? pomodoroActions.pause : pomodoroActions.resume} style={primaryBtnStyle}>
              {pomodoro.isRunning
                ? <Pause size={18} strokeWidth={2} fill="currentColor" />
                : <Play size={18} strokeWidth={2} fill="currentColor" />}
            </button>
          )}

          {pomodoro.phase !== 'idle' && (
            <button onClick={pomodoroActions.reset} style={{ ...iconBtnStyle(false), width: '28px', height: '28px' }}>
              <RotateCcw size={12} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Task chip */}
        {pomodoro.taskTitle ? (
          <div style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '4px',
            background: 'var(--bg-hover)', borderRadius: 'var(--radius)',
            padding: '5px 8px', border: '1px solid var(--line)',
          }}>
            <span style={{
              flex: 1, fontSize: '0.65rem', color: 'var(--text-sub)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={pomodoro.taskTitle}>
              {pomodoro.taskTitle}
            </span>
            <button onClick={() => pomodoroActions.reset()} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex', flexShrink: 0 }}>
              <X size={11} strokeWidth={2} />
            </button>
          </div>
        ) : (
          pomodoro.phase === 'idle' && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)', textAlign: 'center' }}>
              Начни фокус-сессию
            </span>
          )
        )}

        {/* Completed today */}
        <div style={{ fontSize: '0.62rem', color: 'var(--text-faint)', textAlign: 'center' }}>
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
    transition: 'opacity 0.15s, transform 0.15s',
    flexShrink: 0,
  };
}

const primaryBtnStyle: React.CSSProperties = {
  width: '48px', height: '48px',
  borderRadius: '50%',
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 14px rgba(74,124,240,0.35)',
  transition: 'transform 0.15s, box-shadow 0.15s',
  flexShrink: 0,
};

const secondaryBtnStyle: React.CSSProperties = {
  height: '30px',
  borderRadius: '15px',
  border: '1px solid var(--line-strong)',
  background: 'transparent',
  color: 'var(--text-sub)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: '5px',
  padding: '0 10px',
  fontSize: '0.72rem', fontWeight: 600,
  fontFamily: 'var(--font-body)',
  transition: 'border-color 0.15s, color 0.15s',
  flexShrink: 0,
};
