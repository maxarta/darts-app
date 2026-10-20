import { createUISFX, type CueName } from "uisfx";

type Cue = "hit" | "miss" | "bust" | "seal" | "tick" | "next" | "ready" | "win" | "undo" | "round";

/** App events → UI SFX cues in the minimal pack. */
const cueName: Record<Cue, CueName> = {
  hit: "select",
  miss: "delete",
  bust: "blocked",
  seal: "success",
  tick: "hover",
  next: "success",
  ready: "success",
  win: "achievement",
  undo: "cancel",
  round: "select",
};

let ui: ReturnType<typeof createUISFX> | null = null;
const listeners = new Set<() => void>();

function readMuted() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("darts-sounds-muted") === "1";
  } catch {
    return false;
  }
}

let muted = readMuted();

export function soundsMuted() {
  return muted;
}

export function setSoundsMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem("darts-sounds-muted", next ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
  if (!next) playCue("hit");
}

export function subscribeSounds(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function player() {
  if (typeof window === "undefined") return null;
  if (!ui) ui = createUISFX({ pack: "minimal", volume: 1 });
  return ui;
}

function playCue(cue: Cue) {
  if (muted) return;
  const name = cueName[cue];
  if (typeof window !== "undefined" && window.webkit?.messageHandlers?.dartsNative) {
    try {
      window.webkit.messageHandlers.dartsNative.postMessage({
        type: "playCue",
        cue: name,
      });
      return;
    } catch {
      /* fall through to the web player */
    }
  }
  const sounds = player();
  void sounds?.unlock();
  sounds?.play(name);
}

/** Dart landed on the board. */
export function playDartHitSound() {
  playCue("hit");
}

/** Dart off the scoring face. */
export function playMissSound() {
  playCue("miss");
}

/** Visit busted and the score snaps back. */
export function playBustSound() {
  playCue("bust");
}

/** Visit is closed — pull the darts. */
export function playSealSound() {
  playCue("seal");
}

/** One second of the handoff countdown. */
export function playCountdownTickSound(_step = 1) {
  playCue("tick");
}

/** Countdown finished — the other player throws. */
export function playTurnHandoffSound() {
  playCue("next");
}

/** Camera locked, ready for the first dart. */
export function playReadySound() {
  playCue("ready");
}

/** Checkout. */
export function playWinSound() {
  playCue("win");
}

/** Last throw was taken back. */
export function playUndoSound() {
  playCue("undo");
}

/** Player closed the visit and passed the turn. */
export function playNextRoundSound() {
  playCue("round");
}
