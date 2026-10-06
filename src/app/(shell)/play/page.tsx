import { redirect } from "next/navigation";
import type { Player } from "@/lib/types";
import { requireIdentityPage } from "@/lib/auth";
import { stockholmToday } from "@/lib/dates";
import { parseSnapshot } from "@/lib/live";
import { getTodaysGame } from "@/lib/queries/day";
import { parseRuleset } from "@/lib/rules";
import { supabaseAdmin } from "@/lib/supabase";
import { LiveGameCard } from "@/components/game/live-game-card";
import { SetupScreen } from "./setup-screen";
import { TodayDone } from "./today-done";

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

  // One counted game a day (0023). Once today's is crowned there is nothing to
  // start; while someone else is playing it, the way in is to watch or take
  // over. start_game refuses either way — this just says so before anyone
  // picks a roster for nothing.
  const day = await getTodaysGame(today);
  if (day.state === "done") {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <TodayDone gameId={day.gameId} winners={day.winners} score={day.score} />
      </main>
    );
  }
  if (day.state === "live") {
    const { data, error } = await sb.rpc("live_game_snapshot", { p_game_id: day.gameId });
    if (error) throw new Error(error.message);
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Today&apos;s game is under way
        </h1>
        <LiveGameCard initial={parseSnapshot(data)} amScorekeeper={false} />
        <p className="text-sm text-ink-muted">
          One game counts a day, so this is the one. If the phone keeping score
          has gone, open the game and take over.
        </p>
      </main>
    );
  }

  // The board size, the scoring and whether a zero ends the game all come from
  // the season's ruleset. ensure_season creates the quarter the first time it
  // is played, so a brand new quarter needs no setup.
  const { data: seasonId, error: seasonError } = await sb.rpc("ensure_season", {
    p_date: today,
  });
  if (seasonError) throw new Error(seasonError.message);

  const [playersRes, seasonRes] = await Promise.all([
    sb.from("players").select("*").eq("is_active", true).order("created_at"),
    sb.from("seasons").select("ruleset_id").eq("id", seasonId).single(),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
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
      />
    </main>
  );
}
