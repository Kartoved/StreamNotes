import { useState, useEffect, useRef, useCallback } from 'react';

export type PomodoroPhase = 'idle' | 'work' | 'overtime' | 'readyForBreak' | 'break' | 'longBreak';

const WORK_SECS = 25 * 60;
const BREAK_SECS = 5 * 60;
const LONG_BREAK_SECS = 15 * 60;

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
  secondsLeft: number;   // countdown for work/break; elapsed for overtime
  isRunning: boolean;
  taskId: string | null;
  taskTitle: string | null;
  completedToday: number;
  sessionCount: number;
}

export interface PomodoroActions {
  start: (taskId?: string | null, taskTitle?: string | null) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;      // end work/overtime → readyForBreak
  startBreak: () => void;  // readyForBreak → break/longBreak
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
  const endTimeRef = useRef<number | null>(null);       // countdown end wall-clock
  const overtimeStartRef = useRef<number | null>(null); // overtime start wall-clock
  const phaseRef = useRef<PomodoroPhase>('idle');
  const prevPhaseRef = useRef<PomodoroPhase>('idle');   // phase that led into overtime
  const sessionCountRef = useRef(0);
  const isRunningRef = useRef(false);

  phaseRef.current = phase;
  sessionCountRef.current = sessionCount;
  isRunningRef.current = isRunning;

  const notify = useCallback((msg: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Помодоро', { body: msg, icon: '/icon-192.png' });
    }
  }, []);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Any phase timer hit zero → enter overtime (count up until user clicks finish).
  const handleTimeUp = useCallback(() => {
    clearTick();
    endTimeRef.current = null;
    prevPhaseRef.current = phaseRef.current;
    overtimeStartRef.current = Date.now();
    const msg = phaseRef.current === 'work'
      ? 'Время вышло! Нажми «Закончить» когда будешь готов 🍅'
      : 'Перерыв закончился! Нажми «Закончить» когда готов 🍅';
    notify(msg);
    phaseRef.current = 'overtime';
    setPhase('overtime');
    setSecondsLeft(0);
    setIsRunning(true);
  }, [clearTick, notify]);

  // Tick — handles both countdown and overtime count-up.
  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      const p = phaseRef.current;

      if (p === 'overtime') {
        if (overtimeStartRef.current === null) return;
        const elapsed = Math.round((Date.now() - overtimeStartRef.current) / 1000);
        setSecondsLeft(elapsed);
        return;
      }

      // Anchor end time when timer (re-)starts.
      if (endTimeRef.current === null) {
        endTimeRef.current = Date.now() + secondsLeft * 1000;
      }

      const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        handleTimeUp();
      } else {
        setSecondsLeft(remaining);
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearTick();
  // secondsLeft intentionally not a dep — endTimeRef is source of truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, phase]);

  // Sync after tab returns from background.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isRunningRef.current) return;

      const p = phaseRef.current;

      if (p === 'overtime') {
        if (overtimeStartRef.current === null) return;
        const elapsed = Math.round((Date.now() - overtimeStartRef.current) / 1000);
        setSecondsLeft(elapsed);
        return;
      }

      if (endTimeRef.current === null) return;
      const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        handleTimeUp();
      } else {
        setSecondsLeft(remaining);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [handleTimeUp]);

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
      overtimeStartRef.current = null;
      prevPhaseRef.current = 'idle';
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
      if (phaseRef.current === 'overtime') {
        // freeze elapsed time
        if (overtimeStartRef.current !== null) {
          const elapsed = Math.round((Date.now() - overtimeStartRef.current) / 1000);
          setSecondsLeft(elapsed);
        }
        clearTick();
        overtimeStartRef.current = null;
        setIsRunning(false);
        return;
      }
      if (endTimeRef.current !== null) {
        const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
        setSecondsLeft(Math.max(0, remaining));
      }
      clearTick();
      endTimeRef.current = null;
      setIsRunning(false);
    }, [clearTick]),

    resume: useCallback(() => {
      if (phaseRef.current === 'overtime') {
        // Resume overtime: anchor start so elapsed is correct.
        // secondsLeft holds the elapsed time frozen at pause.
        overtimeStartRef.current = Date.now() - secondsLeft * 1000;
        setIsRunning(true);
        return;
      }
      endTimeRef.current = null;
      setIsRunning(true);
    // secondsLeft needed for overtime resume anchor
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [secondsLeft]),

    finish: useCallback(() => {
      clearTick();
      endTimeRef.current = null;
      overtimeStartRef.current = null;
      const fromWork = prevPhaseRef.current === 'work';
      if (fromWork) {
        const newSessions = sessionCountRef.current + 1;
        sessionCountRef.current = newSessions;
        setSessionCount(newSessions);
        setCompletedToday(incrementCompleted());
        phaseRef.current = 'readyForBreak';
        setPhase('readyForBreak');
        setSecondsLeft(0);
      } else {
        // Finishing break overtime → back to idle for next work session.
        phaseRef.current = 'idle';
        setPhase('idle');
        setSecondsLeft(WORK_SECS);
      }
      setIsRunning(false);
    }, [clearTick]),

    startBreak: useCallback(() => {
      const longBreak = sessionCountRef.current % 4 === 0;
      const nextPhase: PomodoroPhase = longBreak ? 'longBreak' : 'break';
      const nextSecs = secsForPhase(nextPhase);
      clearTick();
      endTimeRef.current = null;
      overtimeStartRef.current = null;
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      setSecondsLeft(nextSecs);
      setIsRunning(true);
    }, [clearTick]),

    reset: useCallback(() => {
      clearTick();
      endTimeRef.current = null;
      overtimeStartRef.current = null;
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
  const m = Math.floor(Math.abs(secs) / 60).toString().padStart(2, '0');
  const s = (Math.abs(secs) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
