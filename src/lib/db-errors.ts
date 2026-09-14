/**
 * The game-flow functions raise custom SQLSTATEs (see 0010). This maps them to
 * something worth reading on a phone at a table.
 *
 * [concept: the database owns the rules] The message is written here, but the
 * DECISION is made in SQL, so a second client — or a hand-written insert —
 * cannot get past a rule by not knowing about it.
 */
const MESSAGES: Record<string, string> = {
  STB01: "Someone else is keeping score. Take over first if you need to.",
  STB02: "That does not add up — check the board and try again.",
  STB03: "This game is not in play any more. Reload to see where it got to.",
  STB04: "It is not that player's turn.",
  STB05: "Nobody has played a turn yet.",
  STB06: "That date is in the future.",
  STB07: "There is a newer change on this game, so this one cannot be undone.",
  STB08: "There is nobody left to hand the fika duty to.",
  STB09: "You are already keeping score for another game.",
  // Team play (0021). These reach people who have never seen the app before,
  // so they say what to do rather than what went wrong.
  STB10: "No team play has that code. Check the link and try again.",
  STB11: "This team play has finished — the results are in.",
  STB12: "That team is not at that stage any more. Reload to see where it got to.",
};

const FALLBACK = "That did not save. Try again?";

type MaybePostgrestError = {
  code?: string | null;
  message?: string | null;
} | null;

/** Copy for an error from a game-flow RPC. */
export function describeDbError(error: MaybePostgrestError): string {
  const code = error?.code ?? "";
  if (code in MESSAGES) return MESSAGES[code]!;

  // A unique violation on the one-live-game-per-scorekeeper index reaches us as
  // 23505 rather than our own code, because the index fires before the check.
  if (code === "23505") return MESSAGES.STB09!;

  return FALLBACK;
}

/**
 * Prefers the sentence the database itself wrote, when it wrote one.
 *
 * The roster and team-play RPCs raise messages for the person at the table —
 * "hand over scorekeeping first", "add at least one player first" — under the
 * same STB codes the rest of the flow uses for quite different things. For
 * those, the database's own sentence is the better copy; anything else falls
 * back to the table above.
 */
export function describeDbErrorVerbatim(error: MaybePostgrestError): string {
  const own = error?.code?.startsWith("STB") ? error?.message : null;
  if (!own) return describeDbError(error);
  return own.charAt(0).toUpperCase() + own.slice(1) + ".";
}

export function isConflict(error: MaybePostgrestError): boolean {
  const code = error?.code ?? "";
  return code === "STB01" || code === "STB03" || code === "STB09";
}
