// Streak / daily-login tracking — pure logic, no side effects.
//
// Model:
// - User opens app → recomputeStreak() is called with today's local date.
// - Same day as last login: no-op.
// - Day after last login: streak +1, possibly earn a freeze (every 7th day).
// - Multiple days gap: spend freezes 1-per-missed-day. If freezes cover the
//   gap → streak +1 (continues). If not enough → streak resets to 1.
//
// Freezes: max 3 in inventory. Earned every 7 consecutive days.
// Multiplier: streak% bonus to skill XP, capped at +100% (i.e. 2× max).

export const MAX_FREEZES = 3;
export const FREEZE_EARN_INTERVAL = 7; // every Nth streak day
export const MULTIPLIER_CAP = 100;     // percent

export interface StreakState {
  lastLogin: string;   // 'YYYY-MM-DD' (device local time)
  current: number;
  longest: number;
  freezes: number;
}

export const EMPTY_STREAK: StreakState = {
  lastLogin: '',
  current: 0,
  longest: 0,
  freezes: 0,
};

// Local-time date in YYYY-MM-DD. Pure: takes Date for testability.
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Whole-day diff between two YYYY-MM-DD strings (b - a). DST-safe via UTC
// midnight comparison — both dates represent local calendar days, we just
// need the number of calendar days between them.
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const at = Date.UTC(ay, am - 1, ad);
  const bt = Date.UTC(by, bm - 1, bd);
  return Math.round((bt - at) / 86400000);
}

export function recomputeStreak(state: StreakState, today: string): StreakState {
  // First-ever login
  if (!state.lastLogin) {
    return {
      lastLogin: today,
      current: 1,
      longest: Math.max(state.longest, 1),
      freezes: state.freezes,
    };
  }

  const diff = dayDiff(state.lastLogin, today);

  // Same day → no change
  if (diff === 0) return state;

  // Clock skew or manually set date in the past — keep state, just don't crash
  if (diff < 0) return state;

  // Consecutive day
  if (diff === 1) {
    const next = state.current + 1;
    const earnFreeze = next > 0 && next % FREEZE_EARN_INTERVAL === 0;
    return {
      lastLogin: today,
      current: next,
      longest: Math.max(state.longest, next),
      freezes: earnFreeze ? Math.min(state.freezes + 1, MAX_FREEZES) : state.freezes,
    };
  }

  // Gap of N missed days (between yesterday's slot and today)
  const missed = diff - 1;

  if (missed <= state.freezes) {
    // Freezes cover the gap — streak continues, today counts as +1
    const next = state.current + 1;
    const usedFreezes = state.freezes - missed;
    const earnFreeze = next > 0 && next % FREEZE_EARN_INTERVAL === 0;
    return {
      lastLogin: today,
      current: next,
      longest: Math.max(state.longest, next),
      freezes: earnFreeze ? Math.min(usedFreezes + 1, MAX_FREEZES) : usedFreezes,
    };
  }

  // Streak broken — reset to 1 (today counts as start of new streak)
  return {
    lastLogin: today,
    current: 1,
    longest: state.longest,
    freezes: 0,
  };
}

// Percent multiplier applied to skill XP on done-task transitions.
// Returns the percent value (e.g. 50 means +50% → 1.5× XP).
export function streakMultiplier(streak: number): number {
  return Math.min(Math.max(0, streak), MULTIPLIER_CAP);
}

// Milliseconds until next local-time midnight + 1 second buffer.
// Used by the React hook to schedule the daily recompute.
export function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 1, 0); // tomorrow 00:00:01 local
  return next.getTime() - now.getTime();
}
