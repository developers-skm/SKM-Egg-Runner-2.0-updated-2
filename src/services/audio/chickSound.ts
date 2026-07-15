/**
 * Chick chirp sound — generated via Web Audio API.
 * No file needed. Works on Chrome Android, Safari, Samsung Browser.
 * Preloaded via resume() on first user interaction.
 */

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch { return null; }
  }
  return ctx;
}

// Resume AudioContext after user gesture (required by mobile browsers)
export function resumeAudioContext(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setChickSoundEnabled(on: boolean): void {
  enabled = on;
}

export function getChickSoundEnabled(): boolean {
  return enabled;
}

/**
 * Play a short, cute baby-chick chirp.
 * Two quick frequency sweeps → natural "peep peep" feel.
 * Volume: 60%, duration ~350ms, non-blocking.
 */
export function playChickSuccess(): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;

  if (c.state === 'suspended') {
    c.resume().then(() => _play(c)).catch(() => {});
  } else {
    _play(c);
  }
}

function _play(c: AudioContext): void {
  const now = c.currentTime;

  // Two chirp notes
  const notes = [
    { start: now,        freq: 2800, endFreq: 3400, dur: 0.12 },
    { start: now + 0.15, freq: 3000, endFreq: 3600, dur: 0.10 },
  ];

  notes.forEach(({ start, freq, endFreq, dur }) => {
    const osc  = c.createOscillator();
    const gain = c.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur * 0.6);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.8, start + dur);

    // Envelope: fast attack, gentle decay
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.6, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

    osc.connect(gain);
    gain.connect(c.destination);

    osc.start(start);
    osc.stop(start + dur + 0.01);
  });
}

/**
 * Short neutral UI click — a single filtered tick, distinct from the
 * chick chirp. Used for confirmation feedback outside the scan-success
 * flow (e.g. the Developer Mode "Test Haptic" button).
 */
export function playUiClick(): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  const fire = () => {
    const now = c.currentTime;
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  };
  if (c.state === 'suspended') c.resume().then(fire).catch(() => {});
  else fire();
}
