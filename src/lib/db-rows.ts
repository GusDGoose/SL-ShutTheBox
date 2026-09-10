/**
 * The boundary between the generated database types and the row shapes the
 * app works with.
 *
 * [concept: views are nullable in generated types] Postgres cannot prove that
 * a view column is NOT NULL — the planner has no way to know that
 * `count(*) filter (…)` never returns null — so `supabase gen types` marks
 * EVERY view column nullable. Our views compute those columns and they are
 * never null in practice, and the hand-written row types in queries/* record
 * the nullability that is actually true (avg_score really can be null; wins
 * cannot).
 *
 * Rather than 25 casts scattered through the readers, the assertion lives
 * here once, named, with this comment attached. What the generated types
 * still buy us is the column NAMES: selecting a column that does not exist is
 * now a compile error — which is how a digest query asking for
 * `player_achievements.key` (the column is `achievement_key`) was caught
 * before it ever ran.
 */
export function unwrapRows<T>(res: {
  data: unknown;
  error: { message: string } | null;
}): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

/** The same, for a `.maybeSingle()` that may legitimately find nothing. */
export function unwrapMaybe<T>(res: {
  data: unknown;
  error: { message: string } | null;
}): T | null {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? null) as T | null;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type RpcName = keyof Database["public"]["Functions"];
export type RpcArgs<K extends RpcName> =
  Database["public"]["Functions"][K]["Args"];

/**
 * [concept: nullable RPC arguments] A plpgsql parameter declared
 * `p_note text default null` is optional AND nullable, but the generated
 * Args type makes every argument required and non-null — there is nothing in
 * the catalogue for the generator to read a default from.
 *
 * So this relaxes nullability and nothing else. The function name is still
 * checked against the real catalogue, and so are the argument NAMES, which
 * is where the mistakes actually happen: `p_gameid` for `p_game_id` used to
 * sail through and fail at runtime as "function does not exist".
 *
 * Passing an explicit null is deliberate rather than omitting the key —
 * `set_game_photo(…, p_path => null)` MEANS "take the photo down", and
 * omitting the argument would take the SQL default instead.
 */
export function rpc<K extends RpcName>(
  sb: SupabaseClient<Database>,
  name: K,
  args: { [P in keyof RpcArgs<K>]: RpcArgs<K>[P] | null },
) {
  return sb.rpc(name, args as RpcArgs<K>);
}
