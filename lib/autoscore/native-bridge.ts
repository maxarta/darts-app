import type { ThrowInput, Segment } from "@/lib/darts/rules";

export type NativeBridgeMessage =
  | { type: "nativeReady"; supportsLidar: boolean }
  | { type: "pong"; supportsLidar: boolean; native: boolean }
  | { type: "autoScoreReady"; lidar: boolean; supportsLidar: boolean }
  | { type: "autoScoreCancelled" }
  | { type: "autoScoreFallback"; reason: string; supportsLidar: boolean }
  | {
      type: "autoThrow";
      input: { segment: Segment | number; multiplier: number };
      confidence?: number;
      source?: string;
    };

type DartsNativeAPI = {
  isNative: boolean;
  supportsLidar?: boolean;
  startAutoScore: () => void;
  stopAutoScore: () => void;
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
