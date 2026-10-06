/**
 * What every server action answers with.
 *
 * A discriminated union rather than a thrown error: a Server Function's throw
 * reaches the client as an opaque digest, while `{ ok: false, error }` carries
 * the sentence the person at the table should read.
 *
 * `object` by default, so an action with nothing to return is just `{ ok: true }`.
 */
export type ActionError = { ok: false; error: string };
export type ActionResult<T = object> = ({ ok: true } & T) | ActionError;

/**
 * A "one game a day" refusal (STB13/STB14) that names the game already holding
 * the day, so the page can link to it instead of only saying no.
 *
 * A subtype rather than an optional field on ActionError: every action is
 * still typed ActionResult, and the field rides along at runtime for the few
 * pages that look for it with existingGameOf().
 */
export type DayTakenError = ActionError & { existingGameId: string };

/** The game that holds the day, if this result is a refusal that names one. */
export function existingGameOf(result: { ok: boolean }): string | null {
  if (result.ok || !("existingGameId" in result)) return null;
  const id = (result as DayTakenError).existingGameId;
  return typeof id === "string" ? id : null;
}
