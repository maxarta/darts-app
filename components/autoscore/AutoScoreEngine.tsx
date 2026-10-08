"use client";

import { useEffect, useRef } from "react";
import { DartMotionDetector } from "@/lib/autoscore/motion";
import { KeypointPipeline } from "@/lib/autoscore/keypoint-pipeline";
import { OnnxTipDetector } from "@/lib/autoscore/onnx-detector";
import type { BoardCalibration, DetectedDart } from "@/lib/autoscore/types";
import styles from "./autoscore.module.css";

type Props = {
  stream: MediaStream;
  calibration: BoardCalibration | null;
  /** When false, frames are analyzed but hits are ignored. */
  enabled: boolean;
  onDetect: (dart: DetectedDart) => void;
  /** ML auto-calib progress / ready / board cleared. */
  onMlEvent?: (event: {
    type: "calibProgress" | "ready" | "waitRemoval" | "boardCleared";
    locked?: number;
    need?: number;
  }) => void;
  /** Fired once if ONNX model cannot load — UI should show manual calib. */
  onMlUnavailable?: () => void;
  /** Prefer ONNX keypoints; fall back to motion+manual calib. */
  preferMl?: boolean;
  /** Force visit FSM into wait-for-empty (bust / end visit). */
  waitForRemoval?: boolean;
};

/** Hidden camera loop that emits detected darts into the game. */
export function AutoScoreEngine({
  stream,
  calibration,
  enabled,
  onDetect,
  onMlEvent,
  onMlUnavailable,
  preferMl = true,
  waitForRemoval = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const calibRef = useRef(calibration);
  const enabledRef = useRef(enabled);
  const onDetectRef = useRef(onDetect);
  const onMlEventRef = useRef(onMlEvent);
  const onMlUnavailableRef = useRef(onMlUnavailable);
  const pipelineRef = useRef<KeypointPipeline | null>(null);
  calibRef.current = calibration;
  enabledRef.current = enabled;
  onDetectRef.current = onDetect;
  onMlEventRef.current = onMlEvent;
  onMlUnavailableRef.current = onMlUnavailable;

  useEffect(() => {
    if (!waitForRemoval || !pipelineRef.current) return;
    const events = pipelineRef.current.beginWaitClear();
    for (const e of events) {
      if (e.type === "waitRemoval" || e.type === "boardCleared") {
        onMlEventRef.current?.({ type: e.type });
      }
    }
  }, [waitForRemoval]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {});

    let cancelled = false;
    let timer = 0;
    let motion: DartMotionDetector | null = null;
    let onnx: OnnxTipDetector | null = null;
    let pipeline: KeypointPipeline | null = null;
    let useMl = false;
    let busy = false;
    pipelineRef.current = null;

    const tickMotion = () => {
      if (cancelled) return;
      const calib = calibRef.current;
      if (
        enabledRef.current &&
        calib &&
        video.readyState >= 2 &&
        !video.paused &&
        motion
      ) {
        const hit = motion.analyze(video, calib);
        if (hit) onDetectRef.current(hit);
      }
      timer = window.setTimeout(tickMotion, 90);
    };

    const tickMl = async () => {
      if (cancelled) return;
      // During calibrate, still run frames so 4/4 calib can lock.
      const det = onnx;
      const pipe = pipeline;
      const run =
        video.readyState >= 2 &&
        !video.paused &&
        det != null &&
        pipe != null &&
        !busy;
      if (run && det && pipe) {
        busy = true;
        try {
          const dets = await det.detect(video);
          const events = pipe.pushDetections(dets);
          for (const e of events) {
            if (e.type === "score") {
              if (!enabledRef.current) continue;
              onDetectRef.current({
                input: e.input,
                confidence: e.confidence,
                nx: e.board.x,
                ny: e.board.y,
              });
            } else if (
              e.type === "calibProgress" ||
              e.type === "ready" ||
              e.type === "waitRemoval" ||
              e.type === "boardCleared"
            ) {
              onMlEventRef.current?.({
                type: e.type,
                locked: e.type === "calibProgress" ? e.locked : undefined,
                need: e.type === "calibProgress" ? e.need : undefined,
              });
            }
          }
        } catch (err) {
          console.warn("[autoscore] ML frame failed", err);
        } finally {
          busy = false;
        }
      }
      timer = window.setTimeout(() => void tickMl(), useMl ? 120 : 90);
    };

    void (async () => {
      if (preferMl) {
        onnx = new OnnxTipDetector();
        const ok = await onnx.init();
        if (cancelled) return;
        if (ok) {
          useMl = true;
          pipeline = new KeypointPipeline();
          pipelineRef.current = pipeline;
          timer = window.setTimeout(() => void tickMl(), 200);
          return;
        }
        onnx.dispose();
        onnx = null;
        onMlUnavailableRef.current?.();
      } else {
        onMlUnavailableRef.current?.();
      }
      try {
        motion = new DartMotionDetector();
      } catch {
        return;
      }
      timer = window.setTimeout(tickMotion, 200);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      motion?.reset();
      onnx?.dispose();
      pipeline?.reset();
      pipelineRef.current = null;
    };
  }, [stream, preferMl]);

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
