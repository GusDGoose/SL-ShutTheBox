import type { ActionError, DayTakenError } from "@/lib/action-result";
import { isUuid } from "@/lib/db-rows";

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
  // One counted game a day (0023).
  STB13: "That day already has its game — edit it instead.",
  STB14: "A game is already being played today — watch it, or take over.",
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
  details?: string | null;
} | null;

/** Copy for an error from a game-flow RPC. */
export function describeDbError(error: MaybePostgrestError): string {
  const code = error?.code ?? "";
  if (code in MESSAGES) return MESSAGES[code]!;

  // Two unique indexes can fire before a function's own check, and both reach
  // us as a bare 23505: two phones crowning two games in the same second hit
  // the one-game-a-day index; a scorekeeper starting a second game hits the
  // one-live-game index. Postgres names the index in the message.
  if (code === "23505") {
    return error?.message?.includes("games_one_counted_per_day")
      ? MESSAGES.STB13!
      : MESSAGES.STB09!;
  }

  return FALLBACK;
}

/**
 * The game that already holds the day, from a one-game-a-day refusal.
 * assert_day_free (0023) puts its id in DETAIL; anything else has none.
 */
export function dayGameOf(error: MaybePostgrestError): string | null {
  const code = error?.code ?? "";
  if (code !== "STB13" && code !== "STB14") return null;
  const id = error?.details ?? "";
  return isUuid(id) ? id : null;
}

/** A refused RPC as an action result, carrying the day's game when there is one. */
export function refusal(error: MaybePostgrestError): ActionError | DayTakenError {
  const existingGameId = dayGameOf(error);
  return existingGameId
    ? { ok: false, error: describeDbError(error), existingGameId }
    : { ok: false, error: describeDbError(error) };
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
  return (
    code === "STB01" ||
    code === "STB03" ||
    code === "STB09" ||
    code === "STB13" ||
    code === "STB14"
  );
}
