/**
 * The join code for a team-play event.
 *
 * [concept: the code is the credential] Team play is the one part of the app
 * that is NOT behind the team PIN — colleagues at a team day cannot each be
 * given the office passcode. Holding the six characters is what lets a phone
 * join and keep score, so the alphabet matters: no 0/O and no 1/I, because the
 * code gets read off a projector at the back of a room and typed on a phone.
 *
 * The SQL twin is tournament_normalize_code() in 0021_tournament.sql. They must
 * agree, or a link that works on the lobby page fails when it reaches the
 * database.
 */

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * Turns whatever somebody typed or pasted into the canonical code, or null if
 * it could never be one. Punctuation and spaces go, because the code is
 * DISPLAYED spaced out and people copy what they see.
 */
export function normalizeCode(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return CODE_PATTERN.test(cleaned) ? cleaned : null;
}

export function isValidCode(input: string | null | undefined): boolean {
  return normalizeCode(input) !== null;
}

/**
 * The code as a screen reader should say it: "F I K A 4 2", not "fikaforty-two".
 * Used for the aria-label on the big code in the lobby.
 */
export function codeSpaced(code: string): string {
  return code.split("").join(" ");
}
