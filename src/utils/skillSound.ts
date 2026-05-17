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

// C5 → E5 → G5 arpeggio on task completion.
// Triangle wave is warmer/softer than sine; each note 70 ms with quick decay.
export function playDoneSound(): void {
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    const step = 0.07;

    notes.forEach((freq, i) => {
      const start = t0 + i * step;
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // Ignore — sound is non-critical.
  }
}
