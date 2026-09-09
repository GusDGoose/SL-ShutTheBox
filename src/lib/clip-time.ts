/**
 * Clip positions as people type them ("1:30") and as the database stores them
 * (90). Shared by the clip editor and anything that displays a clip.
 */

/**
 * "1:30" → 90, "1:02:03" → 3723, "90" → 90. Null for anything that cannot be
 * read — never 0, which would silently move a clip to the start of the song.
 */
export function parseTimestamp(input: string): number | null {
  const s = input.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return null;
  const parts = s.split(":").map(Number);
  // Only the leading field may run past 59: "90" is fine, "1:75" is a typo.
  if (parts.slice(1).some((p) => p > 59)) return null;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

/** 90 → "1:30". Minutes are not padded, seconds are. */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
