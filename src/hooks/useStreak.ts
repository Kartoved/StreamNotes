import { useEffect, useRef, useState, useCallback } from 'react';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';
import { SyncEvents } from '../sync/events';
import { showToast } from '../components/Toast';
import {
  StreakState, EMPTY_STREAK,
  dateKey, recomputeStreak, streakMultiplier, msUntilNextMidnight,
} from '../utils/streak';

const STORAGE_KEY = 'streak';

// Streak day thresholds that trigger a celebratory toast on advance.
const MILESTONES = [7, 30, 100];

function statesEqual(a: StreakState, b: StreakState): boolean {
  return a.lastLogin === b.lastLogin
    && a.current === b.current
    && a.longest === b.longest
    && a.freezes === b.freezes;
}

export interface StreakInfo {
  state: StreakState;
  multiplier: number; // percent — applied to skill XP at done-transition
}

const EMPTY_INFO: StreakInfo = { state: EMPTY_STREAK, multiplier: 0 };

export function useStreak(): StreakInfo {
  const db = useDB();
  const { encrypt, decrypt } = useCrypto();
  const [info, setInfo] = useState<StreakInfo>(EMPTY_INFO);
  const stateRef = useRef<StreakState>(EMPTY_STREAK);
  const midnightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (state: StreakState) => {
    try {
      const enc = encrypt(JSON.stringify(state));
      await db.exec(
        `INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)`,
        [STORAGE_KEY, enc]
      );
    } catch (err) {
      console.warn('[streak] persist failed', err);
    }
  }, [db, encrypt]);

  // Re-check whether today's date has been recorded; persist if state changes.
  const recompute = useCallback(async () => {
    const today = dateKey(new Date());
    const prev = stateRef.current;
    const next = recomputeStreak(prev, today);
    if (statesEqual(prev, next)) return;
    stateRef.current = next;
    setInfo({ state: next, multiplier: streakMultiplier(next.current) });
    await persist(next);

    // Milestone celebration — only fires on actual streak advance, not on
    // sync-driven hydration. Crossed = first milestone that prev was below
    // and next reached or surpassed.
    if (next.current > prev.current) {
      const crossed = MILESTONES.find(m => prev.current < m && next.current >= m);
      if (crossed) {
        showToast(`🔥 ${crossed} дней подряд! Бонус к XP: +${Math.min(crossed, 100)}%`, 'success');
      }
    }
  }, [persist]);

  // Load from DB on mount; also subscribe to remote changes (CRDT sync).
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await db.execO(
          `SELECT value FROM user_settings WHERE key = ?`, [STORAGE_KEY]
        ) as any[];
        if (cancelled) return;
        let parsed: StreakState = EMPTY_STREAK;
        if (rows.length > 0 && rows[0].value) {
          try {
            const decoded = decrypt(rows[0].value);
            const obj = JSON.parse(decoded);
            if (obj && typeof obj.current === 'number') {
              parsed = {
                lastLogin: obj.lastLogin || '',
                current: obj.current || 0,
                longest: obj.longest || 0,
                freezes: obj.freezes || 0,
              };
            }
          } catch { /* corrupt entry — treat as empty */ }
        }
        // Skip state update if nothing changed — fires on every user_settings
        // change (incl. unrelated keys like nickname), keep it a cheap no-op.
        if (!statesEqual(stateRef.current, parsed)) {
          stateRef.current = parsed;
          setInfo({ state: parsed, multiplier: streakMultiplier(parsed.current) });
        }
        // Recompute for today's date after loading (idempotent)
        recompute();
      } catch (err) {
        console.warn('[streak] load failed', err);
      }
    };

    load();

    // Re-load when DB updates user_settings (from CRDT sync / other tabs)
    const cleanupUpdate = db.onUpdate((_: any, __: any, tblName: string) => {
      if (tblName === 'user_settings') load();
    });
    const syncListener = () => load();
    SyncEvents.addEventListener('sync', syncListener);

    return () => {
      cancelled = true;
      cleanupUpdate?.();
      SyncEvents.removeEventListener('sync', syncListener);
    };
  }, [db, decrypt, recompute]);

  // Midnight scheduler — fires once at next 00:00:01 local, then reschedules.
  useEffect(() => {
    const schedule = () => {
      midnightTimerRef.current = setTimeout(() => {
        recompute();
        schedule();
      }, msUntilNextMidnight());
    };
    schedule();
    return () => {
      if (midnightTimerRef.current) clearTimeout(midnightTimerRef.current);
    };
  }, [recompute]);

  // Wake-up triggers — visibility / focus pull current date and reconcile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') recompute();
    };
    const onFocus = () => recompute();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [recompute]);

  return info;
}
