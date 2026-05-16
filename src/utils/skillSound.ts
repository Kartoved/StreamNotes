let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

// Short two-tone rising ping played on task completion.
export function playDoneSound(): void {
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime;

    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.14);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);

    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.42);
  } catch {
    // Ignore — sound is non-critical.
  }
}
