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
  // Accumulated active minutes within the current session (work + break, all phases).
  // Each minute = +1 XP that will be persisted when the session ends.
  accumulatedMinutes: number;
}

export interface PomodoroOptions {
  // Persist accumulated minutes when the session ends (finish → idle or reset).
  // Called with the minutes earned and the task this session was attached to.
  onSessionComplete?: (minutes: number, taskId: string | null) => void;
}

export interface PomodoroActions {
  start: (taskId?: string | null, taskTitle?: string | null) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;      // end work/overtime → readyForBreak
  startBreak: () => void;  // readyForBreak → break/longBreak
  reset: () => void;
}

export function usePomodoro(options?: PomodoroOptions): [PomodoroState, PomodoroActions] {
  const [phase, setPhase] = useState<PomodoroPhase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(WORK_SECS);
  const [isRunning, setIsRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [completedToday, setCompletedToday] = useState(getCompletedToday);
  const [sessionCount, setSessionCount] = useState(0);
  const [accumulatedMinutes, setAccumulatedMinutes] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef<number | null>(null);       // countdown end wall-clock
  const overtimeStartRef = useRef<number | null>(null); // overtime start wall-clock
  const phaseRef = useRef<PomodoroPhase>('idle');
  const prevPhaseRef = useRef<PomodoroPhase>('idle');   // phase that led into overtime
  const sessionCountRef = useRef(0);
  const isRunningRef = useRef(false);
  // XP minute tracking — wall-clock to survive bg/foreground transitions.
  const minuteAccrualStartRef = useRef<number | null>(null); // when current accruing minute started
  const accumulatedMinutesRef = useRef(0);
  const taskIdRef = useRef<string | null>(null);
  const onSessionCompleteRef = useRef(options?.onSessionComplete);
  onSessionCompleteRef.current = options?.onSessionComplete;

  phaseRef.current = phase;
  sessionCountRef.current = sessionCount;
  isRunningRef.current = isRunning;
  taskIdRef.current = taskId;
  accumulatedMinutesRef.current = accumulatedMinutes;

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

  // Accrue elapsed full minutes into accumulated counter (wall-clock based, so
  // background tabs don't miss ticks). Call from anywhere — recomputes from
  // minuteAccrualStartRef. Resets the anchor to the boundary remainder.
  const accrueMinutes = useCallback(() => {
    if (minuteAccrualStartRef.current === null) return;
    const elapsedMs = Date.now() - minuteAccrualStartRef.current;
    const fullMin = Math.floor(elapsedMs / 60_000);
    if (fullMin > 0) {
      accumulatedMinutesRef.current += fullMin;
      setAccumulatedMinutes(accumulatedMinutesRef.current);
      minuteAccrualStartRef.current += fullMin * 60_000;
    }
  }, []);

  // Persist accumulated minutes to a callback (creates a "done" note in App).
  // Resets the accumulator + anchor. Safe to call when 0 minutes (no-op).
  const flushSession = useCallback(() => {
    accrueMinutes();
    const mins = accumulatedMinutesRef.current;
    minuteAccrualStartRef.current = null;
    if (mins > 0) {
      onSessionCompleteRef.current?.(mins, taskIdRef.current);
    }
    accumulatedMinutesRef.current = 0;
    setAccumulatedMinutes(0);
  }, [accrueMinutes]);

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

  // Tick — handles both countdown and overtime count-up, plus minute XP accrual.
  useEffect(() => {
    if (!isRunning) return;

    // Anchor minute accrual when an active phase resumes.
    if (minuteAccrualStartRef.current === null) {
      minuteAccrualStartRef.current = Date.now();
    }

    const tick = () => {
      const p = phaseRef.current;

      // Accrue minutes on every tick (cheap; only updates state on minute boundary).
      accrueMinutes();

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

      // Catch up any minutes that ticked over while tab was hidden.
      accrueMinutes();

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
  }, [handleTimeUp, accrueMinutes]);

  const requestNotificationPermission = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const actions: PomodoroActions = {
    start: useCallback((tid?: string | null, title?: string | null) => {
      requestNotificationPermission();
      // If user re-starts without flushing prior session, persist whatever was earned.
      flushSession();
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
      minuteAccrualStartRef.current = Date.now();
      setIsRunning(true);
    }, [requestNotificationPermission, clearTick, flushSession]),

    pause: useCallback(() => {
      // Bank earned minutes; stop accruing while paused.
      accrueMinutes();
      minuteAccrualStartRef.current = null;
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
    }, [clearTick, accrueMinutes]),

    resume: useCallback(() => {
      minuteAccrualStartRef.current = Date.now();
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
        // Finishing work overtime — keep accruing through readyForBreak->break.
        // No flush yet; session continues.
        const newSessions = sessionCountRef.current + 1;
        sessionCountRef.current = newSessions;
        setSessionCount(newSessions);
        setCompletedToday(incrementCompleted());
        phaseRef.current = 'readyForBreak';
        setPhase('readyForBreak');
        setSecondsLeft(0);
        // Pause accrual while waiting for user to start break (idle wait).
        accrueMinutes();
        minuteAccrualStartRef.current = null;
      } else {
        // Finishing break overtime → session complete. Persist & reset.
        flushSession();
        phaseRef.current = 'idle';
        setPhase('idle');
        setSecondsLeft(WORK_SECS);
      }
      setIsRunning(false);
    }, [clearTick, accrueMinutes, flushSession]),

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
      // Resume accrual for the break phase.
      minuteAccrualStartRef.current = Date.now();
      setIsRunning(true);
    }, [clearTick]),

    reset: useCallback(() => {
      // Persist whatever was earned before wiping the session.
      flushSession();
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
    }, [clearTick, flushSession]),
  };

  const state: PomodoroState = {
    phase, secondsLeft, isRunning,
    taskId, taskTitle,
    completedToday, sessionCount,
    accumulatedMinutes,
  };

  return [state, actions];
}

export function formatPomodoroTime(secs: number): string {
  const m = Math.floor(Math.abs(secs) / 60).toString().padStart(2, '0');
  const s = (Math.abs(secs) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
