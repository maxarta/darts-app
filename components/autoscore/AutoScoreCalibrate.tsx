"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BoardCalibration } from "@/lib/autoscore/types";
import styles from "./autoscore.module.css";

type Props = {
  stream: MediaStream;
  onCancel: () => void;
  onConfirm: (calib: BoardCalibration) => void;
};

type ViewMode = "camera" | "lidar";

/** Default circle in normalized video-frame coordinates. */
function defaultCalib(): BoardCalibration {
  return { cx: 0.5, cy: 0.5, r: 0.42 };
}

/** Where object-fit:cover draws the video inside the wrap. */
function coveredVideoRect(
  wrapW: number,
  wrapH: number,
  videoW: number,
  videoH: number
) {
  const wrapAspect = wrapW / Math.max(wrapH, 1);
  const videoAspect = videoW / Math.max(videoH, 1);
  if (videoAspect > wrapAspect) {
    // Wider than wrap — height fills, sides crop.
    const h = wrapH;
    const w = wrapH * videoAspect;
    return { x: (wrapW - w) / 2, y: 0, w, h };
  }
  const w = wrapW;
  const h = wrapW / Math.max(videoAspect, 0.01);
  return { x: 0, y: (wrapH - h) / 2, w, h };
}

export function AutoScoreCalibrate({ stream, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const lidarRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ViewMode>("camera");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const calibRef = useRef<BoardCalibration>(defaultCalib());
  const rafRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    const markReady = () => {
      setReady(true);
      void video.play().catch(() => {
        setError("Не удалось запустить превью камеры");
      });
    };
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    // Stream may already have metadata when re-mounted.
    if (video.readyState >= 1) markReady();

    return () => {
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
    };
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const lidar = lidarRef.current;
    if (!video || !overlay) return;

    const draw = () => {
      const wrap = overlay.parentElement;
      if (!wrap) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      if (overlay.width !== w || overlay.height !== h) {
        overlay.width = w;
        overlay.height = h;
      }
      if (lidar && (lidar.width !== w || lidar.height !== h)) {
        lidar.width = w;
        lidar.height = h;
      }

      const ctx = overlay.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, w, h);

      const vw = video.videoWidth || w;
      const vh = video.videoHeight || h;
      const rect = coveredVideoRect(w, h, vw, vh);
      const calib = calibRef.current;
      const minSide = Math.min(rect.w, rect.h);
      const cx = rect.x + calib.cx * rect.w;
      const cy = rect.y + calib.cy * rect.h;
      const r = calib.r * minSide;

      ctx.fillStyle = "rgba(2, 6, 23, 0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fill("evenodd");

      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(250, 204, 21, 0.45)";
      ctx.lineWidth = 1.5;
      for (const f of [0.09, 0.63, 0.95]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      ctx.fillStyle = "#facc15";
      ctx.font = "700 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("20", cx, cy - r - 10);

      if (mode === "lidar" && lidar && video.readyState >= 2) {
        drawLidarVolume(lidar, video, rect, cx, cy, r);
      } else if (lidar) {
        const lctx = lidar.getContext("2d");
        lctx?.clearRect(0, 0, w, h);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, ready]);

  const ui = (
    <div className={styles.calibrateRoot} data-autoscore-calibrate>
      <div className={styles.videoWrap}>
        <video
          ref={videoRef}
          className={styles.video}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={lidarRef} className={styles.lidarCanvas} aria-hidden />
        <canvas ref={overlayRef} className={styles.overlayCanvas} aria-hidden />

        <div className={styles.hud}>
          <div>
            <p className={styles.hudTitle}>Автоскоринг</p>
            <p className={styles.hudHint}>
              Совместите мишень с жёлтым кругом. Сверху — сектор 20.
            </p>
          </div>
          <div className={styles.modeToggle} role="group" aria-label="Режим">
            <button
              type="button"
              className={[
                styles.modeBtn,
                mode === "camera" ? styles.modeBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setMode("camera")}
            >
              Камера
            </button>
            <button
              type="button"
              className={[
                styles.modeBtn,
                mode === "lidar" ? styles.modeBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setMode("lidar")}
            >
              LiDAR
            </button>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        {error ? <p className={styles.error}>{error}</p> : null}
        <p className={styles.hudTitle} style={{ textAlign: "center" }}>
          {mode === "lidar"
            ? "Объёмная сетка помогает выровнять плоскость мишени"
            : "Штатив · 1–2 м · мишень целиком в круге"}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!ready}
            onClick={() => onConfirm(calibRef.current)}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return ui;
  return createPortal(ui, document.body);
}

function drawLidarVolume(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  rect: { x: number; y: number; w: number; h: number },
  cx: number,
  cy: number,
  r: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const sample = document.createElement("canvas");
  const sw = 48;
  const sh = Math.max(24, Math.round((48 * rect.h) / Math.max(rect.w, 1)));
  sample.width = sw;
  sample.height = sh;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  if (!sctx) return;
  sctx.drawImage(video, 0, 0, sw, sh);
  const { data } = sctx.getImageData(0, 0, sw, sh);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
  ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
  ctx.lineWidth = 1;

  for (let gy = 0; gy < sh; gy++) {
    ctx.beginPath();
    let started = false;
    for (let gx = 0; gx < sw; gx++) {
      const i = (gy * sw + gx) * 4;
      const lum =
        (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) / 255;
      const depth = 1 - lum;
      const px = rect.x + (gx / Math.max(sw - 1, 1)) * rect.w;
      const py = rect.y + (gy / Math.max(sh - 1, 1)) * rect.h + depth * 14;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
      if ((gx + gy) % 3 === 0) {
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }
    ctx.stroke();
  }
}
