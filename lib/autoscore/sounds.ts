let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  frequency: number,
  durationMs: number,
  type: OscillatorType,
  gain = 0.08,
  when = 0
) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + durationMs / 1000);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

/** Short thud when a dart is scored. */
export function playDartHitSound() {
  tone(180, 70, "triangle", 0.11);
  tone(420, 90, "sine", 0.05, 0.03);
}

/** Soft chime when the 5s handoff countdown finishes. */
export function playTurnHandoffSound() {
  tone(523.25, 120, "sine", 0.07);
  tone(659.25, 160, "sine", 0.06, 0.12);
  tone(783.99, 200, "sine", 0.05, 0.24);
}

/** Soft tick each second of the handoff countdown. */
export function playCountdownTickSound() {
  tone(660, 40, "square", 0.03);
}
