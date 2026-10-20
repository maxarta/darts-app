import type { ThrowInput, Segment } from "@/lib/darts/rules";

export type NativeBridgeMessage =
  | { type: "nativeReady"; supportsLidar: boolean }
  | { type: "pong"; supportsLidar: boolean; native: boolean }
  | { type: "autoScoreReady"; lidar: boolean; ml?: boolean; supportsLidar: boolean }
  | { type: "autoScoreCancelled" }
  | { type: "autoScoreFallback"; reason: string; supportsLidar: boolean }
  | {
      type: "autoThrow";
      input: { segment: Segment | number; multiplier: number };
      confidence?: number;
      source?: string;
    }
  /** LiDAR: visit complete, waiting until darts are pulled from the board. */
  | { type: "waitingForRemoval" }
  /** LiDAR: board looks empty again — safe to start next-player countdown. */
  | { type: "boardCleared" }
  /** LiDAR throw-cycle state for the web autoscore panel. */
  | { type: "throwPrompt"; state: NativeThrowPrompt; status: string };

export type NativeThrowPrompt = "throwNow" | "scoring" | "pullDarts";

type DartsNativeAPI = {
  isNative: boolean;
  supportsLidar?: boolean;
  startAutoScore: () => void;
  stopAutoScore: () => void;
  waitForRemoval?: () => void;
  resumeListening?: () => void;
  undoThrow?: () => void;
  ping?: () => void;
};

declare global {
  interface Window {
    DartsNative?: DartsNativeAPI;
    __dartsNative?: {
      onNativeMessage?: (msg: NativeBridgeMessage) => void;
    };
    webkit?: {
      messageHandlers?: {
        dartsNative?: { postMessage: (body: unknown) => void };
      };
    };
  }
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.DartsNative?.isNative ||
      window.webkit?.messageHandlers?.dartsNative
  );
}

export function nativeSupportsLidar(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.DartsNative?.supportsLidar);
}

/** Ask the iOS shell to open the real ARKit LiDAR calibrate UI. */
export function nativeStartAutoScore(): boolean {
  if (!isNativeShell()) return false;
  try {
    if (window.DartsNative?.startAutoScore) {
      window.DartsNative.startAutoScore();
      return true;
    }
    window.webkit?.messageHandlers?.dartsNative?.postMessage({
      type: "startAutoScore",
    });
    return true;
  } catch {
    return false;
  }
}

export function nativeStopAutoScore(): void {
  try {
    window.DartsNative?.stopAutoScore?.();
    window.webkit?.messageHandlers?.dartsNative?.postMessage({
      type: "stopAutoScore",
    });
  } catch {
    /* ignore */
  }
}

/** Visit done — LiDAR should stop scoring and watch for darts being pulled. */
export function nativeWaitForRemoval(): void {
  try {
    if (window.DartsNative?.waitForRemoval) {
      window.DartsNative.waitForRemoval();
      return;
    }
    window.webkit?.messageHandlers?.dartsNative?.postMessage({
      type: "waitForRemoval",
    });
  } catch {
    /* ignore */
  }
}

/** Drop the last camera dart and keep listening. That spot stays ignored while the blob is still there. */
export function nativeUndoThrow(): void {
  try {
    if (window.DartsNative?.undoThrow) {
      window.DartsNative.undoThrow();
      return;
    }
    window.webkit?.messageHandlers?.dartsNative?.postMessage({
      type: "undoThrow",
    });
  } catch {
    /* ignore */
  }
}

/** Undo / cancel — LiDAR resumes listening for throws. */
export function nativeResumeListening(): void {
  try {
    if (window.DartsNative?.resumeListening) {
      window.DartsNative.resumeListening();
      return;
    }
    window.webkit?.messageHandlers?.dartsNative?.postMessage({
      type: "resumeListening",
    });
  } catch {
    /* ignore */
  }
}

function postNative(body: Record<string, unknown>): void {
  try {
    window.webkit?.messageHandlers?.dartsNative?.postMessage(body);
  } catch {
    /* ignore */
  }
}

/** «Бросил» — score the darts that are on the board now. */
export function nativeUserThrown(): void {
  postNative({ type: "userThrown" });
}

/** «Чисто — дальше» — board is empty, capture a new reference. */
export function nativeUserClear(): void {
  postNative({ type: "userClear" });
}

/** Web renders the throw panel; native draws the live camera into the hole it reports. */
export function nativeSetWebThrowUi(on: boolean): void {
  postNative({ type: "autoScoreUi", web: on });
}

/** Where the throw screen wants the live camera, in viewport points. */
export function reportCameraHole(rect: {
  x: number;
  y: number;
  w: number;
  h: number;
} | null): void {
  postNative({
    type: "cameraHole",
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
    w: rect?.w ?? 0,
    h: rect?.h ?? 0,
  });
}

/** User fixed dart `index` (0–2) of the current visit — ground truth for the dataset. */
export function nativeLabelThrow(index: number, input: ThrowInput): void {
  postNative({
    type: "labelThrow",
    index,
    segment: input.segment,
    multiplier: input.multiplier,
  });
}

export function parseNativeThrow(raw: {
  segment: Segment | number;
  multiplier: number;
}): ThrowInput | null {
  const mult = raw.multiplier;
  if (mult !== 1 && mult !== 2 && mult !== 3) return null;
  const seg = raw.segment;
  if (seg === "miss" || seg === "bull25" || seg === "bull50") {
    return { segment: seg, multiplier: mult };
  }
  if (typeof seg === "number" && seg >= 1 && seg <= 20) {
    return { segment: seg, multiplier: mult };
  }
  return null;
}

type Handler = (msg: NativeBridgeMessage) => void;

/** Subscribe to messages from the iOS shell. Returns unsubscribe. */
export function subscribeNativeBridge(handler: Handler): () => void {
  if (typeof window === "undefined") return () => {};

  window.__dartsNative = window.__dartsNative ?? {};
  const prev = window.__dartsNative.onNativeMessage;
  window.__dartsNative.onNativeMessage = (msg) => {
    prev?.(msg);
    handler(msg);
  };

  const onReady = () => {
    handler({
      type: "nativeReady",
      supportsLidar: nativeSupportsLidar(),
    });
  };
  document.addEventListener("darts-native-ready", onReady);

  // Late subscription: shell may already be ready.
  if (isNativeShell()) {
    queueMicrotask(onReady);
    window.DartsNative?.ping?.();
  }

  return () => {
    document.removeEventListener("darts-native-ready", onReady);
    if (window.__dartsNative?.onNativeMessage === handler) {
      window.__dartsNative.onNativeMessage = prev;
    }
  };
}
