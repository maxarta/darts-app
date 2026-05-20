"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { KENNY_THEME_COLOR } from "@/lib/tournament/variant";
import styles from "./tournament.module.css";

/** Жёлтый фон сертификата Kenny (kennyPrizeBanner) */
const KENNY_CERTIFICATE_YELLOW = "#ffdf20";
/** Тёмно-зелёный заголовок сертификата */
const KENNY_CERTIFICATE_GREEN_DARK = "#016630";

const KENNY_COLORS = [
  KENNY_THEME_COLOR,
  KENNY_CERTIFICATE_GREEN_DARK,
  "#1a9e47",
  KENNY_CERTIFICATE_YELLOW,
  "#fff8b8",
  "#fde047",
];

const DEFAULT_COLORS = [
  "#fff500",
  "#ff2056",
  "#ffffff",
  "#ff8a00",
  "#ffe566",
  "#ff4d8d",
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  life: number;
  maxLife: number;
};

function spawnSalute(originX: number, originY: number, colors: string[]): Particle {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.45;
  const speed = 3.5 + Math.random() * 5.5;
  return {
    x: originX + (Math.random() - 0.5) * 18,
    y: originY + (Math.random() - 0.5) * 12,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: 12 + Math.random() * 14,
    color: colors[Math.floor(Math.random() * colors.length)]!,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.18,
    life: 0,
    maxLife: 110 + Math.random() * 80,
  };
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const alpha = Math.min(1, Math.max(0.35, 1 - p.life / p.maxLife));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.shadowBlur = 10;
  ctx.shadowColor = p.color;
  ctx.fillStyle = p.color;
  const w = p.size;
  const h = p.size * 0.55;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-w / 4, -h / 4, w / 2, h / 2);
  ctx.restore();
}

type Props = {
  active: boolean;
  originRef: RefObject<HTMLElement | null>;
  /** Kenny: зелёный фон + жёлтый сертификат */
  variant?: "kenny" | "default";
};

export function TournamentConfetti({
  active,
  originRef,
  variant = "default",
}: Props) {
  const colors = variant === "kenny" ? KENNY_COLORS : DEFAULT_COLORS;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number | null>(null);
  const burstCooldownRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active || !mounted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(window.innerWidth * dpr);
      canvas.height = Math.ceil(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);

    const readOrigin = () => {
      const el = originRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    const tick = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const origin = readOrigin();
      if (origin) {
        burstCooldownRef.current -= 1;
        if (
          burstCooldownRef.current <= 0 &&
          particlesRef.current.length < 260
        ) {
          const burst = 22 + Math.floor(Math.random() * 14);
          for (let i = 0; i < burst; i++) {
            particlesRef.current.push(spawnSalute(origin.x, origin.y, colors));
          }
          burstCooldownRef.current = 12 + Math.floor(Math.random() * 10);
        }
      }

      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.07;
        p.vx *= 0.993;
        p.vy *= 0.993;
        p.rotation += p.spin;
        p.life += 1;

        drawParticle(ctx, p);

        return (
          p.life < p.maxLife &&
          p.y > -120 &&
          p.y < h + 120 &&
          p.x > -120 &&
          p.x < w + 120
        );
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    particlesRef.current = [];
    burstCooldownRef.current = 0;
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
      particlesRef.current = [];
      burstCooldownRef.current = 0;
    };
  }, [active, mounted, originRef, colors]);

  if (!active || !mounted) return null;

  return createPortal(
    <canvas
      ref={canvasRef}
      className={styles.confettiCanvasPortal}
      aria-hidden
    />,
    document.body
  );
}
