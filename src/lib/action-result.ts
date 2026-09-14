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
