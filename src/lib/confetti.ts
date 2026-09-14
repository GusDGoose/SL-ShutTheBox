import confetti from "canvas-confetti";

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

export function burst(origin: { x: number; y: number }) {
  if (prefersReducedMotion()) return;
  confetti({ particleCount: 120, spread: 75, origin });
}
