import { useState, useEffect, useRef, useCallback } from 'react';

export type PomodoroPhase = 'idle' | 'work' | 'break' | 'longBreak';

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
  // Tracks the wall-clock time when the current phase should end (for background sync)
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

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endTimeRef.current = null;
  }, []);

  // When timer hits zero
  const handleFinish = useCallback((finishedPhase: PomodoroPhase, currentSessions: number) => {
    stop();
    setIsRunning(false);

    if (finishedPhase === 'work') {
      const newSessions = currentSessions + 1;
      setSessionCount(newSessions);
      const newCount = incrementCompleted();
      setCompletedToday(newCount);

      const isLongBreak = newSessions % 4 === 0;
      if (isLongBreak) {
        notify('Отличная работа! Длинный перерыв 15 минут 🎉');
        setPhase('longBreak');
        setSecondsLeft(LONG_BREAK_SECS);
      } else {
        notify('Помидор завершён! Отдохни 5 минут ☕');
        setPhase('break');
        setSecondsLeft(BREAK_SECS);
      }
    } else {
      // Break finished
      notify('Перерыв окончен! Время работать 🍅');
      setPhase('work');
      setSecondsLeft(WORK_SECS);
    }
  }, [stop, notify]);

  // Tick — also updates endTimeRef when starting
  useEffect(() => {
    if (!isRunning) return;
    const currentPhase = phase;
    const currentSessions = sessionCount;

    // Set end time when timer starts/resumes
    if (endTimeRef.current === null) {
      endTimeRef.current = Date.now() + secondsLeft * 1000;
    }

    intervalRef.current = setInterval(() => {
      const remaining = Math.round((endTimeRef.current! - Date.now()) / 1000);
      if (remaining <= 0) {
        handleFinish(currentPhase, currentSessions);
        setSecondsLeft(0);
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, phase, sessionCount]);

  // Sync timer after tab returns from background (mobile browsers throttle timers)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isRunningRef.current || endTimeRef.current === null) return;

      const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        handleFinish(phaseRef.current, sessionCountRef.current);
        setSecondsLeft(0);
      } else {
        setSecondsLeft(remaining);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleFinish]);

  // Request notification permission on first use
  const requestNotificationPermission = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const actions: PomodoroActions = {
    start: useCallback((tid?: string | null, title?: string | null) => {
      requestNotificationPermission();
      endTimeRef.current = null; // will be set in tick effect
      setTaskId(tid ?? null);
      setTaskTitle(title ?? null);
      setPhase('work');
      setSecondsLeft(WORK_SECS);
      setIsRunning(true);
    }, [requestNotificationPermission]),

    pause: useCallback(() => {
      // Capture remaining time so resume restarts from correct position
      if (endTimeRef.current !== null) {
        const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
        setSecondsLeft(Math.max(0, remaining));
      }
      endTimeRef.current = null;
      setIsRunning(false);
    }, []),

    resume: useCallback(() => {
      endTimeRef.current = null; // will be recalculated from current secondsLeft in tick effect
      setIsRunning(true);
    }, []),

    reset: useCallback(() => {
      stop();
      setIsRunning(false);
      setPhase('idle');
      setSecondsLeft(WORK_SECS);
      setTaskId(null);
      setTaskTitle(null);
    }, [stop]),
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
