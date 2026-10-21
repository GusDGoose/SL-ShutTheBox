import confetti from "canvas-confetti";
import { THEME_META, isSeason } from "@/lib/theme";

/**
 * The celebration's confetti, shared by the daily crown and team play.
 *
 * Reduced motion is honoured here, once, so no caller can forget it.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// shapeFromText draws to a canvas, so each glyph is made once and kept.
const glyphShapes = new Map<string, confetti.Shape>();
function glyph(text: string): confetti.Shape | null {
  let shape = glyphShapes.get(text);
  if (!shape) {
    try {
      shape = confetti.shapeFromText({ text, scalar: 2 });
    } catch {
      return null;
    }
    glyphShapes.set(text, shape);
  }
  return shape;
}

export function burst(origin: { x: number; y: number }) {
  if (prefersReducedMotion()) return;
  const theme = document.documentElement.dataset.theme;
  const season = isSeason(theme) ? THEME_META[theme].season : undefined;
  if (!season) {
    confetti({ particleCount: 120, spread: 75, origin });
    return;
  }

  // A season's burst: its own colours, plus a handful of its emoji riding on top.
  confetti({ particleCount: 110, spread: 80, origin, colors: season.confetti.colors });
  const shapes = season.confetti.emoji
    .map(glyph)
    .filter((s): s is confetti.Shape => s !== null);
  if (shapes.length > 0) {
    confetti({
      particleCount: 18,
      spread: 70,
      origin,
      shapes,
      scalar: 2,
      flat: true,
      gravity: 0.8,
      ticks: 260,
    });
  }
}
