import { useState, useEffect, useRef, useCallback } from 'react';

export type PomodoroPhase = 'idle' | 'work' | 'break' | 'longBreak';

const WORK_SECS = 25 * 60;
const BREAK_SECS = 5 * 60;
const LONG_BREAK_SECS = 15 * 60;

// Break auto-starts after work; the next work session always requires an
// explicit user click. Matches typical pomodoro apps (PomoFocus default).
const AUTO_START_BREAK = true;
const AUTO_START_WORK = false;

function todayKey() {
  return 'pomodoro_' + new Date().toISOString().slice(0, 10);
}

function getCompletedToday(): number {
  return parseInt(localStorage.getItem(todayKey()) || '0', 10);
}

function incrementCompleted(): number {
  const key = todayKey();
  const next = getCompletedToday() + 1;
  localStorage.setItem(key, String(next));
  return next;
}

function secsForPhase(p: PomodoroPhase): number {
  switch (p) {
    case 'work': return WORK_SECS;
    case 'break': return BREAK_SECS;
    case 'longBreak': return LONG_BREAK_SECS;
    default: return WORK_SECS;
  }
}

export interface PomodoroState {
  phase: PomodoroPhase;
  secondsLeft: number;
  isRunning: boolean;
  taskId: string | null;
  taskTitle: string | null;
  completedToday: number;
  sessionCount: number; // work sessions completed in a row (for long break)
}

export interface PomodoroActions {
  start: (taskId?: string | null, taskTitle?: string | null) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

export function usePomodoro(): [PomodoroState, PomodoroActions] {
  const [phase, setPhase] = useState<PomodoroPhase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(WORK_SECS);
  const [isRunning, setIsRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [completedToday, setCompletedToday] = useState(getCompletedToday);
  const [sessionCount, setSessionCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Wall-clock timestamp when the current phase should end (survives background throttling).
  const endTimeRef = useRef<number | null>(null);
  const phaseRef = useRef<PomodoroPhase>('idle');
  const sessionCountRef = useRef(0);
  const isRunningRef = useRef(false);

  phaseRef.current = phase;
  sessionCountRef.current = sessionCount;
  isRunningRef.current = isRunning;

  const notify = useCallback((msg: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Помидор', { body: msg, icon: '/icon-192.png' });
    }
  }, []);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Atomically transition to the next phase when the current timer hits zero.
  // Reads current phase/sessions from refs so it doesn't need to be in the
  // tick effect's deps (which was a source of stale-closure bugs).
  const handleFinish = useCallback(() => {
    clearTick();
    endTimeRef.current = null;

    const finishedPhase = phaseRef.current;

    if (finishedPhase === 'work') {
      const newSessions = sessionCountRef.current + 1;
      sessionCountRef.current = newSessions;
      setSessionCount(newSessions);
      setCompletedToday(incrementCompleted());

      const longBreak = newSessions % 4 === 0;
      const nextPhase: PomodoroPhase = longBreak ? 'longBreak' : 'break';
      const nextSecs = secsForPhase(nextPhase);

      notify(longBreak
        ? 'Отличная работа! Длинный перерыв 15 минут 🎉'
        : 'Помидор завершён! Отдохни 5 минут ☕');

      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      setSecondsLeft(nextSecs);
      setIsRunning(AUTO_START_BREAK);
    } else {
      // Break finished → ready for next work session.
      notify('Перерыв окончен! Время работать 🍅');
      phaseRef.current = 'work';
      setPhase('work');
      setSecondsLeft(WORK_SECS);
      setIsRunning(AUTO_START_WORK);
    }
  }, [clearTick, notify]);

  // Tick — recomputes secondsLeft from wall-clock to survive throttling.
  useEffect(() => {
    if (!isRunning) return;

    // Anchor the end time when the timer (re-)starts.
    if (endTimeRef.current === null) {
      endTimeRef.current = Date.now() + secondsLeft * 1000;
    }

    const tick = () => {
      if (endTimeRef.current === null) return;
      const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        // Single source of truth for the next state — don't setSecondsLeft here.
        handleFinish();
      } else {
        setSecondsLeft(remaining);
      }
    };

    // Tick once immediately so the visible counter doesn't lag a second.
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearTick();
  // secondsLeft is intentionally NOT a dep — we use endTimeRef as the source of truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, phase]);

  // Sync after tab returns from background (mobile browsers throttle timers).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isRunningRef.current || endTimeRef.current === null) return;

      const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        handleFinish();
      } else {
        setSecondsLeft(remaining);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [handleFinish]);

  const requestNotificationPermission = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const actions: PomodoroActions = {
    start: useCallback((tid?: string | null, title?: string | null) => {
      requestNotificationPermission();
      clearTick();
      endTimeRef.current = null;
      sessionCountRef.current = 0;
      setSessionCount(0);
      setTaskId(tid ?? null);
      setTaskTitle(title ?? null);
      phaseRef.current = 'work';
      setPhase('work');
      setSecondsLeft(WORK_SECS);
      setIsRunning(true);
    }, [requestNotificationPermission, clearTick]),

    pause: useCallback(() => {
      // Freeze remaining seconds; resume will anchor a fresh endTime from it.
      if (endTimeRef.current !== null) {
        const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
        setSecondsLeft(Math.max(0, remaining));
      }
      clearTick();
      endTimeRef.current = null;
      setIsRunning(false);
    }, [clearTick]),

    resume: useCallback(() => {
      // Tick effect will anchor endTimeRef from current secondsLeft.
      endTimeRef.current = null;
      setIsRunning(true);
    }, []),

    reset: useCallback(() => {
      clearTick();
      endTimeRef.current = null;
      sessionCountRef.current = 0;
      phaseRef.current = 'idle';
      setIsRunning(false);
      setPhase('idle');
      setSecondsLeft(WORK_SECS);
      setSessionCount(0);
      setTaskId(null);
      setTaskTitle(null);
    }, [clearTick]),
  };

  const state: PomodoroState = {
    phase, secondsLeft, isRunning,
    taskId, taskTitle,
    completedToday, sessionCount,
  };

  return [state, actions];
}

export function formatPomodoroTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
