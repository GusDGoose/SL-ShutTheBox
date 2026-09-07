import { redirect } from "next/navigation";
import type { Player } from "@/lib/types";
import { requireIdentityPage } from "@/lib/auth";
import { stockholmToday } from "@/lib/dates";
import { parseRuleset } from "@/lib/rules";
import { supabaseAdmin } from "@/lib/supabase";
import { SetupScreen } from "./setup-screen";

export const dynamic = "force-dynamic";

export default async function NewGamePage() {
  const sb = supabaseAdmin();
  const today = stockholmToday();
  const me = await requireIdentityPage("/play");

  // A game you are already keeping score for is the one you want, not a new
  // one — and start_game would refuse a second anyway.
  const { data: live } = await sb
    .from("games")
    .select("id")
    .eq("scorekeeper_player_id", me.id)
    .eq("status", "in_progress")
    .is("deleted_at", null)
    .maybeSingle();
  if (live) redirect(`/game/${(live as { id: string }).id}`);

  // The board size, the scoring and whether a zero ends the game all come from
  // the season's ruleset. ensure_season creates the quarter the first time it
  // is played, so a brand new quarter needs no setup.
  const { data: seasonId, error: seasonError } = await sb.rpc("ensure_season", {
    p_date: today,
  });
  if (seasonError) throw new Error(seasonError.message);

  const [playersRes, gamesRes, seasonRes] = await Promise.all([
    sb.from("players").select("*").eq("is_active", true).order("created_at"),
    sb.from("games").select("id").eq("played_on", today).is("deleted_at", null),
    sb.from("seasons").select("ruleset_id").eq("id", seasonId).single(),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (gamesRes.error) throw new Error(gamesRes.error.message);
  if (seasonRes.error) throw new Error(seasonRes.error.message);

  // Fetched separately rather than as an embedded select: without generated
  // types supabase-js types a to-one relation as an array, and casting around
  // that hides a real shape mismatch. WP-B12 brings the generated types.
  const rulesetRes = await sb
    .from("rulesets")
    .select("rules")
    .eq("id", seasonRes.data.ruleset_id)
    .single();
  if (rulesetRes.error) throw new Error(rulesetRes.error.message);

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <SetupScreen
        rules={parseRuleset(rulesetRes.data.rules)}
        players={(playersRes.data ?? []) as Player[]}
        gamesToday={gamesRes.data?.length ?? 0}
      />
    </main>
  );
}
