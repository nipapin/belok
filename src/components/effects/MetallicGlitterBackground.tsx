"use client";

import { useEffect, useRef } from "react";

type Theme = "light" | "dark";

/** linear-gradient(to top, #646669, #bacef0) as RGB; light: #9ca0a4 → #d8e6f4 */
const BRAND = {
  dark: { r0: 100, g0: 102, b0: 105, r1: 186, g1: 206, b1: 240 },
  light: { r0: 156, g0: 160, b0: 164, r1: 216, g1: 230, b1: 244 },
} as const;

const PLASMA_CENTER = 192;
const PLASMA_SPREAD = 64;
/** Scales real elapsed time so motion matches “time += 0.03 / frame” demos (~1.8 per second) */
const PLASMA_TIME_SCALE = 2;
/** Sample grid for plasma (0…30 in formula); higher = smaller cells, smoother before blur */
const PLASMA_GRID_N = 100;
/** Blur in CSS pixels when compositing the plasma layer (softens the grid) */
const PLASMA_BLUR_PX = 2.5;

function getTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

// Classic 3-channel plasma field (0…30 like the snippet), unbounded animation `time` drives it
function plasmaR(x: number, y: number, time: number) {
  return Math.floor(PLASMA_CENTER + PLASMA_SPREAD * Math.cos((x * x - y * y) / 300 + time));
}

function plasmaG(x: number, y: number, time: number) {
  return Math.floor(
    PLASMA_CENTER + PLASMA_SPREAD * Math.sin((x * x * Math.cos(time / 4) + y * y * Math.sin(time / 3)) / 300),
  );
}

function plasmaB(x: number, y: number, time: number) {
  const cx = 15;
  const cy = 15;
  return Math.floor(
    PLASMA_CENTER +
      PLASMA_SPREAD *
        Math.sin(5 * Math.sin(time / 9) + ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / 50),
  );
}

/**
 * One scalar field (plasma still uses R+G+B math for motion), color stays **on the brand segment only** —
 * no per-channel offset → no green/magenta; chrome-like cool silver/blue, not a hue sweep.
 */
function mapPlasmaToBrand(pr: number, pg: number, pb: number, theme: Theme) {
  const c = theme === "dark" ? BRAND.dark : BRAND.light;
  const luma = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
  const t = Math.max(0, Math.min(1, 0.5 + (luma - PLASMA_CENTER) / 75));
  return {
    r: Math.min(255, Math.max(0, Math.floor(c.r0 + (c.r1 - c.r0) * t))),
    g: Math.min(255, Math.max(0, Math.floor(c.g0 + (c.g1 - c.g0) * t))),
    b: Math.min(255, Math.max(0, Math.floor(c.b0 + (c.b1 - c.b0) * t))),
  };
}

/**
 * Plasma (RGB math field) recolored into #646669 → #bacef0, + foil noise, glitter, vignette.
 * Sits at z-0; client shell should be `relative z-10`.
 */
export default function MetallicGlitterBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const patternRef = useRef<CanvasPattern | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const plasmaBuf = document.createElement("canvas");
    const pctx = plasmaBuf.getContext("2d", { alpha: false });
    if (!pctx) return;

    const noiseSize = 160;
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = noiseSize;
    noiseCanvas.height = noiseSize;
    const nctx = noiseCanvas.getContext("2d");
    if (nctx) {
      const id = nctx.createImageData(noiseSize, noiseSize);
      for (let i = 0; i < id.data.length; i += 4) {
        const grain = 115 + (Math.random() - 0.5) * 100;
        const v = Math.max(0, Math.min(255, grain));
        id.data[i] = v;
        id.data[i + 1] = v;
        id.data[i + 2] = v;
        id.data[i + 3] = 255;
      }
      nctx.putImageData(id, 0, 0);
    }
    patternRef.current = null;

    let raf = 0;
    let theme: Theme = getTheme();
    let reduceMotion = false;
    if (typeof window !== "undefined") {
      reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    const onTheme = () => {
      theme = getTheme();
    };
    const obs = new MutationObserver(onTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      reduceMotion = motionQuery.matches;
    };
    motionQuery.addEventListener("change", onMotion);

    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);

    const n = 100;
    const particles = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.3 + Math.random() * 0.95,
      ph: Math.random() * Math.PI * 2,
      sp: 0.35 + Math.random() * 1.4,
    }));

    const smallGlitter = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.12 + Math.random() * 0.4,
      ph: Math.random() * Math.PI * 2,
      sp: 0.5 + Math.random() * 2,
    }));

    const start = performance.now();

    const drawGlitter = (w: number, h: number, time: number, list: typeof particles, baseAlpha: number) => {
      for (const p of list) {
        const tw = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(time * p.sp + p.ph));
        const px = p.x * w;
        const py = p.y * h;
        const rad = p.r * (0.75 + 0.25 * Math.sin(time * 1.6 + p.ph));
        const a = baseAlpha * tw;

        const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 2.2);
        if (theme === "dark") {
          g.addColorStop(0, `rgba(255, 255, 255, ${a * 0.75})`);
          g.addColorStop(0.35, `rgba(200, 214, 235, ${a * 0.4})`);
          g.addColorStop(1, "rgba(186, 206, 240, 0)");
        } else {
          g.addColorStop(0, `rgba(80, 88, 98, ${a * 0.4})`);
          g.addColorStop(0.5, `rgba(150, 165, 185, ${a * 0.2})`);
          g.addColorStop(1, "rgba(120, 130, 145, 0)");
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();

        if (tw > 0.78 && !reduceMotion) {
          const spark = (tw - 0.78) * 3.2;
          ctx.strokeStyle = theme === "dark" ? `rgba(255,255,255,${spark * 0.3})` : `rgba(50, 55, 62,${spark * 0.2})`;
          ctx.lineWidth = 0.35;
          ctx.beginPath();
          ctx.moveTo(px - rad * 2, py);
          ctx.lineTo(px + rad * 2, py);
          ctx.moveTo(px, py - rad * 2);
          ctx.lineTo(px, py + rad * 2);
          ctx.stroke();
        }
      }
    };

    const frame = (t: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const raw = (t - start) * 0.001;
      const time = reduceMotion ? 0.2 : raw;
      const plasmaT = (reduceMotion ? 0.45 : time) * PLASMA_TIME_SCALE;

      // --- 1) Plasma in brand colors on an offscreen buffer, then composite with blur (hides cell edges)
      plasmaBuf.width = w;
      plasmaBuf.height = h;
      pctx.globalCompositeOperation = "source-over";
      pctx.globalAlpha = 1;
      const N = PLASMA_GRID_N;
      const cellW = w / N;
      const cellH = h / N;
      for (let yi = 0; yi <= N; yi++) {
        const yf = (yi / N) * 30;
        const y0 = yi * cellH;
        for (let xi = 0; xi <= N; xi++) {
          const xf = (xi / N) * 30;
          const pr = plasmaR(xf, yf, plasmaT);
          const pg = plasmaG(xf, yf, plasmaT);
          const pb = plasmaB(xf, yf, plasmaT);
          const { r, g, b } = mapPlasmaToBrand(pr, pg, pb, theme);
          const x0 = xi * cellW;
          pctx.fillStyle = `rgb(${r},${g},${b})`;
          pctx.fillRect(x0, y0, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.filter = `blur(${PLASMA_BLUR_PX}px)`;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(plasmaBuf, 0, 0, w, h);
      ctx.restore();

      // Subtle mid depth (keeps a bit of depth over the field)
      const midD = ctx.createLinearGradient(0, h * 0.32, 0, h * 0.68);
      midD.addColorStop(0, "rgba(0,0,0,0)");
      midD.addColorStop(0.5, theme === "dark" ? "rgba(20, 22, 26, 0.06)" : "rgba(100, 108, 120, 0.04)");
      midD.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = midD;
      ctx.fillRect(0, 0, w, h);

      // --- 3) Foil / glitter grain: tiled noise, overlay
      if (noiseCanvas) {
        if (!patternRef.current) {
          patternRef.current = ctx.createPattern(noiseCanvas, "repeat");
        }
        const p = patternRef.current;
        if (p) {
          ctx.save();
          ctx.globalAlpha = theme === "dark" ? 0.2 : 0.14;
          ctx.globalCompositeOperation = "overlay";
          ctx.fillStyle = p;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }

      // --- 4) Sparkle dots (on top of grain)
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      drawGlitter(w, h, time, smallGlitter, theme === "dark" ? 0.32 : 0.2);
      drawGlitter(w, h, time, particles, theme === "dark" ? 0.38 : 0.24);

      // --- 5) Vignette + left corners (ref: darker top-left & bottom-left)
      const centerV = ctx.createRadialGradient(
        w * 0.5,
        h * 0.48,
        Math.min(w, h) * 0.12,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.75,
      );
      if (theme === "dark") {
        centerV.addColorStop(0, "rgba(0,0,0,0)");
        centerV.addColorStop(1, "rgba(0,0,0,0.2)");
      } else {
        centerV.addColorStop(0, "rgba(0,0,0,0)");
        centerV.addColorStop(1, "rgba(90, 95, 105, 0.08)");
      }
      ctx.fillStyle = centerV;
      ctx.fillRect(0, 0, w, h);

      const tl = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.55);
      tl.addColorStop(0, theme === "dark" ? "rgba(20, 22, 26, 0.35)" : "rgba(180, 185, 195, 0.15)");
      tl.addColorStop(0.6, "rgba(0,0,0,0)");
      ctx.fillStyle = tl;
      ctx.fillRect(0, 0, w, h);

      const bl = ctx.createRadialGradient(0, h, 0, 0, h, Math.max(w, h) * 0.45);
      bl.addColorStop(0, theme === "dark" ? "rgba(15, 17, 20, 0.28)" : "rgba(160, 165, 175, 0.12)");
      bl.addColorStop(0.65, "rgba(0,0,0,0)");
      ctx.fillStyle = bl;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      patternRef.current = null;
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      obs.disconnect();
      motionQuery.removeEventListener("change", onMotion);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-0 h-dvh w-full"
      aria-hidden
    />
  );
}
