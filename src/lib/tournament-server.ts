import "server-only";

import { rpc } from "@/lib/db-rows";
import { supabaseAdmin } from "@/lib/supabase";
import {
  parseTournamentSnapshot,
  type TournamentSnapshot,
} from "@/lib/tournament";

/**
 * The one way the server reads an event: by its code, or not at all.
 *
 * Both pages and the polling action need exactly this — look the code up,
 * narrow the jsonb, treat "no row" as null — and three copies of it is how the
 * RPC's null contract would eventually drift in one of them. `code` must
 * already be normalised; the callers own that step because they decide what to
 * do with a bad one (404, redirect, or an error message).
 */
export async function readTournament(
  code: string,
): Promise<TournamentSnapshot | null> {
  const { data, error } = await rpc(supabaseAdmin(), "tournament_snapshot_by_code", {
    p_code: code,
  });
  if (error) throw new Error(error.message);
  return data ? parseTournamentSnapshot(data) : null;
}
