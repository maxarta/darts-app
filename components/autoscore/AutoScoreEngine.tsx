"use client";

import { useEffect, useRef } from "react";
import { DartMotionDetector } from "@/lib/autoscore/motion";
import type { BoardCalibration, DetectedDart } from "@/lib/autoscore/types";
import styles from "./autoscore.module.css";

type Props = {
  stream: MediaStream;
  calibration: BoardCalibration;
  /** When false, frames are analyzed but hits are ignored. */
  enabled: boolean;
  onDetect: (dart: DetectedDart) => void;
};

/** Hidden camera loop that emits detected darts into the game. */
export function AutoScoreEngine({
  stream,
  calibration,
  enabled,
  onDetect,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const calibRef = useRef(calibration);
  const enabledRef = useRef(enabled);
  const onDetectRef = useRef(onDetect);
  calibRef.current = calibration;
  enabledRef.current = enabled;
  onDetectRef.current = onDetect;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {});

    let detector: DartMotionDetector | null = null;
    try {
      detector = new DartMotionDetector();
    } catch {
      return;
    }

    let timer = 0;
    const tick = () => {
      if (
        enabledRef.current &&
        video.readyState >= 2 &&
        !video.paused &&
        detector
      ) {
        const hit = detector.analyze(video, calibRef.current);
        if (hit) onDetectRef.current(hit);
      }
      timer = window.setTimeout(tick, 90);
    };
    timer = window.setTimeout(tick, 200);

    return () => {
      window.clearTimeout(timer);
      detector?.reset();
    };
  }, [stream]);

  useEffect(() => {
    // Fresh cooldown when re-enabled after a visit handoff.
    if (!enabled) return;
  }, [enabled]);

  return (
    <video
      ref={videoRef}
      className={styles.hiddenVideo}
      playsInline
      muted
      autoPlay
      aria-hidden
    />
  );
}
