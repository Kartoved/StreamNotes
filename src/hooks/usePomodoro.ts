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

// ── Session persistence (localStorage; taskTitle resolved from DB on load) ──
const STATE_KEY = 'sn_pomodoro_state_v1';

interface PersistedState {
  phase: PomodoroPhase;
  prevPhase: PomodoroPhase;
  taskId: string | null;
  isRunning: boolean;
  secondsLeft: number;
  endTime: number | null;
  overtimeStartTime: number | null;
  sessionCount: number;
  accumulatedMinutes: number;
  minuteAccrualStart: number | null;
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function persistState(s: PersistedState) {
  try {
    // Don't persist a clean idle state — keep localStorage tidy.
    if (s.phase === 'idle' && s.sessionCount === 0 && s.accumulatedMinutes === 0 && s.taskId === null) {
      localStorage.removeItem(STATE_KEY);
      return;
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch { /* ignore quota errors */ }
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
  // Hydrate the task title after a page reload (taskId persists; title doesn't,
  // because it's plaintext content that the master key has to decrypt first).
  setTaskTitle: (title: string) => void;
}

export function usePomodoro(options?: PomodoroOptions): [PomodoroState, PomodoroActions] {
  // ── Restore from localStorage if present ──────────────────────────────
  // Compute fresh state from persisted snapshot — pure function, no side
  // effects, suitable for useState lazy init.
  const restored = (() => {
    const p = loadPersistedState();
    if (!p) return null;
    const now = Date.now();
    let phase = p.phase;
    let isRunning = p.isRunning;
    let secondsLeft = p.secondsLeft;
    let endTime = p.endTime;
    let overtimeStartTime = p.overtimeStartTime;

    if (isRunning) {
      // Running countdown — check if it expired during reload/while closed.
      if ((phase === 'work' || phase === 'break' || phase === 'longBreak') && endTime !== null) {
        if (now >= endTime) {
          // Timer expired while away — transition to overtime, anchor start at endTime.
          overtimeStartTime = endTime;
          secondsLeft = Math.round((now - endTime) / 1000);
          endTime = null;
          phase = 'overtime';
        } else {
          secondsLeft = Math.round((endTime - now) / 1000);
        }
      } else if (phase === 'overtime' && overtimeStartTime !== null) {
        secondsLeft = Math.round((now - overtimeStartTime) / 1000);
      }
    }

    // Recompute minutes that ticked over while we were gone.
    let extraMinutes = 0;
    let minuteAccrualStart = p.minuteAccrualStart;
    if (isRunning && minuteAccrualStart !== null) {
      const elapsedMs = now - minuteAccrualStart;
      const full = Math.floor(elapsedMs / 60_000);
      if (full > 0) {
        extraMinutes = full;
        minuteAccrualStart += full * 60_000;
      }
    }

    return {
      phase, isRunning, secondsLeft, endTime, overtimeStartTime,
      taskId: p.taskId, prevPhase: p.prevPhase,
      sessionCount: p.sessionCount,
      accumulatedMinutes: p.accumulatedMinutes + extraMinutes,
      minuteAccrualStart,
    };
  })();

  const [phase, setPhase] = useState<PomodoroPhase>(restored?.phase ?? 'idle');
  const [secondsLeft, setSecondsLeft] = useState(restored?.secondsLeft ?? WORK_SECS);
  const [isRunning, setIsRunning] = useState(restored?.isRunning ?? false);
  const [taskId, setTaskId] = useState<string | null>(restored?.taskId ?? null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [completedToday, setCompletedToday] = useState(getCompletedToday);
  const [sessionCount, setSessionCount] = useState(restored?.sessionCount ?? 0);
  const [accumulatedMinutes, setAccumulatedMinutes] = useState(restored?.accumulatedMinutes ?? 0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef<number | null>(restored?.endTime ?? null);
  const overtimeStartRef = useRef<number | null>(restored?.overtimeStartTime ?? null);
  const phaseRef = useRef<PomodoroPhase>(restored?.phase ?? 'idle');
  const prevPhaseRef = useRef<PomodoroPhase>(restored?.prevPhase ?? 'idle');
  const sessionCountRef = useRef(restored?.sessionCount ?? 0);
  const isRunningRef = useRef(restored?.isRunning ?? false);
  const minuteAccrualStartRef = useRef<number | null>(restored?.minuteAccrualStart ?? null);
  const accumulatedMinutesRef = useRef(restored?.accumulatedMinutes ?? 0);
  const taskIdRef = useRef<string | null>(restored?.taskId ?? null);
  const onSessionCompleteRef = useRef(options?.onSessionComplete);
  onSessionCompleteRef.current = options?.onSessionComplete;

  phaseRef.current = phase;
  sessionCountRef.current = sessionCount;
  isRunningRef.current = isRunning;
  taskIdRef.current = taskId;
  accumulatedMinutesRef.current = accumulatedMinutes;

  // Snapshot current state for persistence. Pull from refs (live values) where
  // possible; React state lags by one render, but refs are always current.
  const persist = useCallback((override?: { secondsLeft?: number }) => {
    persistState({
      phase: phaseRef.current,
      prevPhase: prevPhaseRef.current,
      taskId: taskIdRef.current,
      isRunning: isRunningRef.current,
      secondsLeft: override?.secondsLeft ?? secondsLeft,
      endTime: endTimeRef.current,
      overtimeStartTime: overtimeStartRef.current,
      sessionCount: sessionCountRef.current,
      accumulatedMinutes: accumulatedMinutesRef.current,
      minuteAccrualStart: minuteAccrualStartRef.current,
    });
  }, [secondsLeft]);

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
  // Returns true if any minutes were added (caller may want to persist).
  const accrueMinutes = useCallback((): boolean => {
    if (minuteAccrualStartRef.current === null) return false;
    const elapsedMs = Date.now() - minuteAccrualStartRef.current;
    const fullMin = Math.floor(elapsedMs / 60_000);
    if (fullMin > 0) {
      accumulatedMinutesRef.current += fullMin;
      setAccumulatedMinutes(accumulatedMinutesRef.current);
      minuteAccrualStartRef.current += fullMin * 60_000;
      return true;
    }
    return false;
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
    isRunningRef.current = true;
    setPhase('overtime');
    setSecondsLeft(0);
    setIsRunning(true);
    persistState({
      phase: 'overtime', prevPhase: prevPhaseRef.current,
      taskId: taskIdRef.current, isRunning: true, secondsLeft: 0,
      endTime: null, overtimeStartTime: overtimeStartRef.current,
      sessionCount: sessionCountRef.current,
      accumulatedMinutes: accumulatedMinutesRef.current,
      minuteAccrualStart: minuteAccrualStartRef.current,
    });
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
      const accrued = accrueMinutes();

      const p = phaseRef.current;

      if (p === 'overtime') {
        if (overtimeStartRef.current === null) return;
        const elapsed = Math.round((Date.now() - overtimeStartRef.current) / 1000);
        setSecondsLeft(elapsed);
        if (accrued) persist({ secondsLeft: elapsed });
        return;
      }

      if (endTimeRef.current === null) return;
      const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        handleTimeUp();
      } else {
        setSecondsLeft(remaining);
        if (accrued) persist({ secondsLeft: remaining });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [handleTimeUp, accrueMinutes, persist]);

  // Persist whenever accumulated minutes change (minute boundary while running).
  useEffect(() => {
    if (isRunningRef.current) persist();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accumulatedMinutes]);

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
      taskIdRef.current = tid ?? null;
      setTaskId(tid ?? null);
      setTaskTitle(title ?? null);
      phaseRef.current = 'work';
      setPhase('work');
      setSecondsLeft(WORK_SECS);
      minuteAccrualStartRef.current = Date.now();
      isRunningRef.current = true;
      setIsRunning(true);
      persist({ secondsLeft: WORK_SECS });
    }, [requestNotificationPermission, clearTick, flushSession, persist]),

    pause: useCallback(() => {
      // Bank earned minutes; stop accruing while paused.
      accrueMinutes();
      minuteAccrualStartRef.current = null;
      let frozenSecs = secondsLeft;
      if (phaseRef.current === 'overtime') {
        if (overtimeStartRef.current !== null) {
          frozenSecs = Math.round((Date.now() - overtimeStartRef.current) / 1000);
          setSecondsLeft(frozenSecs);
        }
        clearTick();
        overtimeStartRef.current = null;
        isRunningRef.current = false;
        setIsRunning(false);
        persist({ secondsLeft: frozenSecs });
        return;
      }
      if (endTimeRef.current !== null) {
        frozenSecs = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
        setSecondsLeft(frozenSecs);
      }
      clearTick();
      endTimeRef.current = null;
      isRunningRef.current = false;
      setIsRunning(false);
      persist({ secondsLeft: frozenSecs });
    }, [clearTick, accrueMinutes, persist, secondsLeft]),

    resume: useCallback(() => {
      minuteAccrualStartRef.current = Date.now();
      if (phaseRef.current === 'overtime') {
        // Resume overtime: anchor start so elapsed is correct.
        // secondsLeft holds the elapsed time frozen at pause.
        overtimeStartRef.current = Date.now() - secondsLeft * 1000;
        isRunningRef.current = true;
        setIsRunning(true);
        persist();
        return;
      }
      // Re-anchor end time from frozen secondsLeft.
      endTimeRef.current = Date.now() + secondsLeft * 1000;
      isRunningRef.current = true;
      setIsRunning(true);
      persist();
    // secondsLeft needed for resume anchor calculation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [secondsLeft, persist]),

    finish: useCallback(() => {
      clearTick();
      endTimeRef.current = null;
      overtimeStartRef.current = null;
      const fromWork = prevPhaseRef.current === 'work';
      let finalSecs = 0;
      if (fromWork) {
        // Finishing work overtime — keep accruing through readyForBreak->break.
        const newSessions = sessionCountRef.current + 1;
        sessionCountRef.current = newSessions;
        setSessionCount(newSessions);
        setCompletedToday(incrementCompleted());
        phaseRef.current = 'readyForBreak';
        setPhase('readyForBreak');
        setSecondsLeft(0);
        accrueMinutes();
        minuteAccrualStartRef.current = null;
      } else {
        // Finishing break overtime → session complete. Persist & reset.
        flushSession();
        phaseRef.current = 'idle';
        prevPhaseRef.current = 'idle';
        setPhase('idle');
        finalSecs = WORK_SECS;
        setSecondsLeft(WORK_SECS);
        taskIdRef.current = null;
        setTaskId(null);
        setTaskTitle(null);
      }
      isRunningRef.current = false;
      setIsRunning(false);
      persist({ secondsLeft: finalSecs });
    }, [clearTick, accrueMinutes, flushSession, persist]),

    startBreak: useCallback(() => {
      const longBreak = sessionCountRef.current % 4 === 0;
      const nextPhase: PomodoroPhase = longBreak ? 'longBreak' : 'break';
      const nextSecs = secsForPhase(nextPhase);
      clearTick();
      endTimeRef.current = Date.now() + nextSecs * 1000;
      overtimeStartRef.current = null;
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      setSecondsLeft(nextSecs);
      minuteAccrualStartRef.current = Date.now();
      isRunningRef.current = true;
      setIsRunning(true);
      persist({ secondsLeft: nextSecs });
    }, [clearTick, persist]),

    reset: useCallback(() => {
      // Persist whatever was earned before wiping the session.
      flushSession();
      clearTick();
      endTimeRef.current = null;
      overtimeStartRef.current = null;
      sessionCountRef.current = 0;
      phaseRef.current = 'idle';
      prevPhaseRef.current = 'idle';
      isRunningRef.current = false;
      taskIdRef.current = null;
      setIsRunning(false);
      setPhase('idle');
      setSecondsLeft(WORK_SECS);
      setSessionCount(0);
      setTaskId(null);
      setTaskTitle(null);
      persist({ secondsLeft: WORK_SECS });
    }, [clearTick, flushSession, persist]),

    setTaskTitle: useCallback((title: string) => {
      // Only used after page reload to hydrate title from decrypted DB content.
      // No persistence — title isn't stored, taskId is.
      setTaskTitle(title);
    }, []),
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
