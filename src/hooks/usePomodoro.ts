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

  // Tick
  useEffect(() => {
    if (!isRunning) return;
    const currentPhase = phase;
    const currentSessions = sessionCount;
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          handleFinish(currentPhase, currentSessions);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => stop();
  }, [isRunning, phase, sessionCount, handleFinish, stop]);

  // Request notification permission on first use
  const requestNotificationPermission = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const actions: PomodoroActions = {
    start: useCallback((tid?: string | null, title?: string | null) => {
      requestNotificationPermission();
      setTaskId(tid ?? null);
      setTaskTitle(title ?? null);
      setPhase('work');
      setSecondsLeft(WORK_SECS);
      setIsRunning(true);
    }, [requestNotificationPermission]),

    pause: useCallback(() => {
      setIsRunning(false);
    }, []),

    resume: useCallback(() => {
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
