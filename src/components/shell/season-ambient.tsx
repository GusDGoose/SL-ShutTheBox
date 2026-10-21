"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { THEME_META, isSeason, type Ambient } from "@/lib/theme";

const EFFECTS_KEY = "stb.effects";

/**
 * The per-device "Seasonal effects" switch. Same shape as the mute store in
 * audio-provider.tsx: localStorage the server cannot see, read through
 * useSyncExternalStore so there is no wrong first render.
 */
const effectsStore = (() => {
  const listeners = new Set<() => void>();
  let cached: boolean | null = null;
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): boolean {
      if (cached === null) {
        try {
          cached = window.localStorage.getItem(EFFECTS_KEY) !== "off";
        } catch {
          cached = true;
        }
      }
      return cached;
    },
    getServerSnapshot(): boolean {
      return true;
    },
    set(next: boolean) {
      cached = next;
      try {
        window.localStorage.setItem(EFFECTS_KEY, next ? "on" : "off");
      } catch {
        // Will not persist; still applies for this visit.
      }
      listeners.forEach((listener) => listener());
    },
  };
})();

export function useSeasonEffects(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    effectsStore.subscribe,
    effectsStore.getSnapshot,
    effectsStore.getServerSnapshot,
  );
  return [on, effectsStore.set];
}

/**
 * Watches <html data-theme>, which the picker and ThemeSync change in place.
 * `initial` is what the server stamped, so the first render already matches.
 */
export function useBoardTheme(initial?: string): string | undefined {
  const [theme, setTheme] = useState<string | undefined>(initial);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme);
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

// ---------------------------------------------------------------------------
// The particle recipes.
//
// [concept: one engine, many weathers] Every season is the same small particle
// system with a different recipe: which way things drift, how fast, what they
// look like (a dot, a streak, a ring, a scrap of paper or an emoji glyph). The
// fireworks are the one exception and get their own little simulation below.

type Look =
  | { kind: "dot"; colors: string[]; glow?: boolean; edge?: string }
  | { kind: "streak"; color: string }
  | { kind: "ring"; color: string }
  | { kind: "paper"; colors: string[] }
  | { kind: "glyph"; glyphs: string[] };

type Layer = {
  look: Look;
  /** Particles on a 1000px-wide screen; scaled to the viewport. */
  density: number;
  size: [number, number];
  /** Pixels per second; negative rises. */
  speed: [number, number];
  /** Sideways sway amplitude in px. */
  sway: number;
  /** Drift across the screen instead of falling (bats). */
  across?: boolean;
  spin?: boolean;
  /** Twinkle opacity. */
  twinkle?: boolean;
  opacity?: number;
};

const SNOW: Layer = {
  // The faint blue edge is what keeps white snow visible on a cream page.
  look: { kind: "dot", colors: ["#ffffff", "#f1f7ff", "#dfeefc"], edge: "rgba(90,120,160,0.3)" },
  density: 70,
  size: [1.5, 4],
  speed: [25, 70],
  sway: 18,
  opacity: 0.9,
};

const RECIPES: Record<Exclude<Ambient, "fireworks">, Layer[]> = {
  frost: [SNOW, { look: { kind: "glyph", glyphs: ["❄️"] }, density: 6, size: [14, 24], speed: [20, 40], sway: 24, spin: true, opacity: 0.8 }],
  christmas: [
    SNOW,
    { look: { kind: "glyph", glyphs: ["❄️", "⭐"] }, density: 5, size: [14, 22], speed: [20, 40], sway: 24, spin: true, opacity: 0.85 },
  ],
  hearts: [{ look: { kind: "glyph", glyphs: ["❤️", "💕", "💗", "💖"] }, density: 12, size: [14, 28], speed: [-45, -20], sway: 30, opacity: 0.8 }],
  sugar: [{ look: { kind: "dot", colors: ["#ffffff", "#fff7ea"], edge: "rgba(140,105,60,0.4)" }, density: 60, size: [1, 2.6], speed: [12, 35], sway: 10, opacity: 0.85 }],
  blossom: [{ look: { kind: "glyph", glyphs: ["🌸", "🌱", "🌸"] }, density: 10, size: [14, 22], speed: [25, 50], sway: 40, spin: true, opacity: 0.85 }],
  feathers: [{ look: { kind: "glyph", glyphs: ["🪶", "🐣", "🥚", "🪶"] }, density: 10, size: [16, 26], speed: [20, 45], sway: 45, spin: true, opacity: 0.85 }],
  rain: [
    { look: { kind: "streak", color: "rgba(150,190,230,0.55)" }, density: 40, size: [10, 18], speed: [380, 520], sway: 0 },
    { look: { kind: "glyph", glyphs: ["🌷"] }, density: 4, size: [16, 24], speed: [30, 50], sway: 30, spin: true, opacity: 0.85 },
  ],
  embers: [{ look: { kind: "dot", colors: ["#ffb347", "#ff7a1a", "#ffd27a", "#ff4d2e"], glow: true }, density: 45, size: [1.2, 3.2], speed: [-80, -30], sway: 22, twinkle: true }],
  lilac: [{ look: { kind: "glyph", glyphs: ["🌸", "🌼", "💜"] }, density: 10, size: [14, 22], speed: [25, 45], sway: 40, spin: true, opacity: 0.85 }],
  flags: [{ look: { kind: "paper", colors: ["#005b99", "#fecc02"] }, density: 50, size: [5, 9], speed: [50, 110], sway: 30, spin: true }],
  meadow: [{ look: { kind: "glyph", glyphs: ["🌼", "🦋", "🌸", "🍓"] }, density: 11, size: [14, 24], speed: [20, 45], sway: 50, spin: true, opacity: 0.9 }],
  bubbles: [
    { look: { kind: "ring", color: "rgba(160,215,255,0.7)" }, density: 30, size: [3, 9], speed: [-60, -25], sway: 14 },
    { look: { kind: "glyph", glyphs: ["☀️"] }, density: 1, size: [18, 24], speed: [-25, -15], sway: 20, opacity: 0.7 },
  ],
  lanterns: [{ look: { kind: "glyph", glyphs: ["🏮", "🏮", "🦞", "🌕"] }, density: 8, size: [16, 26], speed: [-30, -12], sway: 22, opacity: 0.85 }],
  apples: [{ look: { kind: "glyph", glyphs: ["🍂", "🍎", "🍁", "🍄"] }, density: 10, size: [14, 24], speed: [30, 60], sway: 45, spin: true, opacity: 0.9 }],
  leaves: [{ look: { kind: "glyph", glyphs: ["🍁", "🍂", "🍂"] }, density: 14, size: [14, 26], speed: [30, 65], sway: 55, spin: true, opacity: 0.9 }],
  bats: [
    { look: { kind: "glyph", glyphs: ["🦇", "🦇", "👻"] }, density: 5, size: [18, 30], speed: [60, 120], sway: 30, across: true, opacity: 0.85 },
    { look: { kind: "dot", colors: ["#9cff57", "#ff7a1a", "#a259ff"], glow: true }, density: 25, size: [1, 2.4], speed: [-30, -10], sway: 20, twinkle: true },
  ],
  glow: [{ look: { kind: "dot", colors: ["#ffcf6e", "#ffe7a8", "#ffb347"], glow: true }, density: 30, size: [1.2, 3], speed: [-25, -8], sway: 12, twinkle: true }],
  candles: [
    { look: { kind: "dot", colors: ["#ffe08a", "#ffffff", "#ffcf6e"], glow: true }, density: 35, size: [1.2, 3], speed: [-25, -8], sway: 12, twinkle: true },
    { look: { kind: "glyph", glyphs: ["⭐", "🕯️"] }, density: 3, size: [14, 20], speed: [-20, -10], sway: 15, opacity: 0.8 },
  ],
};

type Particle = {
  layer: Layer;
  x: number;
  y: number;
  vy: number;
  size: number;
  phase: number;
  rot: number;
  vr: number;
  paint: string;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function spawn(layer: Layer, w: number, h: number, anywhere: boolean): Particle {
  const vy = rand(layer.speed[0], layer.speed[1]);
  const look = layer.look;
  const paint =
    look.kind === "glyph"
      ? pick(look.glyphs)
      : look.kind === "dot" || look.kind === "paper"
        ? pick(look.colors)
        : look.color;
  let x = rand(0, w);
  let y = anywhere ? rand(0, h) : vy > 0 ? rand(-60, -10) : rand(h + 10, h + 60);
  if (layer.across) {
    x = anywhere ? rand(0, w) : rand(-120, -30);
    y = rand(h * 0.05, h * 0.6);
  }
  return {
    layer,
    x,
    y,
    vy,
    size: rand(layer.size[0], layer.size[1]),
    phase: rand(0, Math.PI * 2),
    rot: rand(0, Math.PI * 2),
    vr: layer.spin ? rand(-1.2, 1.2) : 0,
    paint,
  };
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Rocket = { x: number; y: number; vy: number; targetY: number; color: string };

const FIREWORK_COLORS = ["#f2c14e", "#ff6bd6", "#7dffcf", "#7ab8ff", "#ffffff", "#ff7a5c"];

function startAmbient(canvas: HTMLCanvasElement, ambient: Ambient): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  let w = 0;
  let h = 0;
  let particles: Particle[] = [];
  const layers = ambient === "fireworks" ? [] : RECIPES[ambient];
  const sparks: Spark[] = [];
  const rockets: Rocket[] = [];
  let nextRocket = 0.6;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // A phone gets fewer particles than a wall screen, but never none.
    const scale = Math.max(0.45, Math.min(1.6, w / 1000));
    particles = layers.flatMap((layer) =>
      Array.from({ length: Math.max(1, Math.round(layer.density * scale)) }, () =>
        spawn(layer, w, h, true),
      ),
    );
  };
  resize();
  window.addEventListener("resize", resize);

  let raf = 0;
  let last = performance.now();
  let t = 0;

  const drawParticle = (p: Particle) => {
    const { layer } = p;
    const look = layer.look;
    const sway = Math.sin(t * 0.9 + p.phase) * layer.sway;
    const x = layer.across ? p.x : p.x + sway;
    const y = layer.across ? p.y + sway : p.y;
    let alpha = layer.opacity ?? 1;
    if (layer.twinkle) alpha *= 0.55 + 0.45 * Math.sin(t * 3 + p.phase * 5);
    ctx.globalAlpha = alpha;

    switch (look.kind) {
      case "dot": {
        if (look.glow) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, p.size * 4);
          g.addColorStop(0, p.paint);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.fillRect(x - p.size * 4, y - p.size * 4, p.size * 8, p.size * 8);
        }
        ctx.fillStyle = p.paint;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (look.edge) {
          ctx.strokeStyle = look.edge;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        break;
      }
      case "streak":
        ctx.strokeStyle = p.paint;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.size * 0.15, y + p.size);
        ctx.stroke();
        break;
      case "ring":
        ctx.strokeStyle = p.paint;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "paper":
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(t * 4 + p.phase));
        ctx.fillStyle = p.paint;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
        break;
      case "glyph":
        ctx.save();
        ctx.translate(x, y);
        if (layer.spin) ctx.rotate(Math.sin(p.rot) * 0.6);
        if (layer.across) ctx.scale(1, 0.8 + 0.2 * Math.sin(t * 12 + p.phase));
        ctx.font = `${p.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.paint, 0, 0);
        ctx.restore();
        break;
    }
  };

  const fireworks = (dt: number) => {
    nextRocket -= dt;
    if (nextRocket <= 0 && rockets.length < 3) {
      rockets.push({
        x: rand(w * 0.1, w * 0.9),
        y: h + 10,
        vy: -rand(h * 0.7, h * 1.0),
        targetY: rand(h * 0.12, h * 0.45),
        color: pick(FIREWORK_COLORS),
      });
      nextRocket = rand(0.9, 2.4);
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += r.vy * dt;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#fff3c4";
      ctx.fillRect(r.x - 1, r.y, 2, 8);
      if (r.y <= r.targetY) {
        rockets.splice(i, 1);
        const n = 46;
        const power = rand(90, 170);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const v = power * rand(0.7, 1);
          sparks.push({
            x: r.x,
            y: r.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 1,
            color: Math.random() < 0.2 ? "#ffffff" : r.color,
          });
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.vy += 60 * dt; // gravity
      s.vx *= 0.985;
      s.vy *= 0.985;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt * 0.7;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, s.life) * (0.7 + 0.3 * Math.random());
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.layer.across) p.x += p.vy * dt;
      else p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const gone = p.layer.across
        ? p.x > w + 60
        : p.vy > 0
          ? p.y > h + 40
          : p.y < -40;
      if (gone) particles[i] = spawn(p.layer, w, h, false);
      drawParticle(particles[i]);
    }
    if (ambient === "fireworks") fireworks(dt);
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (document.visibilityState === "visible") {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
    ctx.clearRect(0, 0, w, h);
  };
}

/**
 * The season drifting over the app: snow at Christmas, bats at Halloween,
 * fireworks at New Year. One fixed canvas that never takes a tap, hidden from
 * screen readers, off for reduced motion, and switchable per device in More.
 * Classic boards have none.
 */
export function SeasonAmbient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useBoardTheme();
  const [enabled] = useSeasonEffects();
  const ambient = isSeason(theme) ? THEME_META[theme].season?.ambient : undefined;

  useEffect(() => {
    if (!enabled || !ambient || !canvas.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return startAmbient(canvas.current, ambient);
  }, [enabled, ambient]);

  if (!enabled || !ambient) return null;
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 h-full w-full"
    />
  );
}
