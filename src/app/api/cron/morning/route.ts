import { NextResponse } from "next/server";
import { requireCron, SessionError } from "@/lib/auth";
import { claimCronRun, recordCronResult } from "@/lib/cron";
import { isoMonday, shiftDays, stockholmToday } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";
import { postDigest, postFikaCard } from "@/lib/teams";

export const dynamic = "force-dynamic";

/**
 * The weekday morning job.
 *
 * Every weekday: sweep up games that were started and never finished, so
 * Today does not show "Live now" from three days ago and the one-live-game
 * index is free.
 *
 * Mondays as well: draw the fika rota and post last week's digest.
 *
 * Hitting the database at all is itself load-bearing — Supabase pauses a
 * free project after seven idle days, and a paused project on a Monday
 * morning is how the office finds out.
 *
 * `?on=YYYY-MM-DD` runs the job as if it were that date. This is the recovery
 * path for the Monday the cron did not fire — and the only way to exercise
 * the Monday branch on a Thursday. It is behind the same CRON_SECRET as the
 * job itself, and the idempotency key follows the given date, so a manual
 * re-run of a day that already ran is still a no-op.
 */
export async function GET(request: Request) {
  try {
    requireCron(request);
  } catch (e) {
    if (e instanceof SessionError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const asked = new URL(request.url).searchParams.get("on");
  const today = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? asked! : stockholmToday();
  if (!(await claimCronRun("morning", today))) {
    return NextResponse.json({ ran: false, reason: "already ran today" });
  }

  const sb = supabaseAdmin();
  const result: Record<string, unknown> = { date: today };

  // Stale games, every weekday.
  const { data: abandoned, error: abandonError } = await sb.rpc(
    "abandon_stale_games",
    { p_older_than: "3 hours" },
  );
  if (abandonError) throw new Error(abandonError.message);
  result.abandoned = (abandoned as unknown[] | null)?.length ?? 0;

  const isMonday = isoMonday(today) === today;
  result.monday = isMonday;

  if (isMonday) {
    // Draw first: the digest carries the "who buys fika" line, so drawing
    // afterwards would post a digest that says nobody is buying.
    // p_actor is `default null` in SQL — the cron is not a person — but the
    // generator types every argument as required and non-null.
    const { data: duty, error: drawError } = await sb.rpc("draw_fika", {
      p_week_start: today,
      p_actor: undefined,
    });
    if (drawError) {
      // A roster with nobody on it is not a reason to skip the digest.
      result.fika = { error: drawError.message };
    } else {
      const d = duty as {
        player_id: string;
        reason: "worst_last_week" | "random_fallback";
        detail: { badness?: number; games?: number };
      } | null;
      result.fika = d?.player_id ?? null;

      if (d) {
        const { data: who } = await sb
          .from("players")
          .select("name, emoji")
          .eq("id", d.player_id)
          .maybeSingle();
        const person = who as { name: string; emoji: string } | null;
        if (person) {
          result.fikaCardPosted = await postFikaCard({
            ...person,
            reason: d.reason,
            badness: d.detail?.badness ?? null,
            games: d.detail?.games ?? null,
          });
        }
      }
    }

    result.digestPosted = await postDigest(await lastWeek(today));
  }

  await recordCronResult("morning", today, result);
  return NextResponse.json({ ran: true, ...result });
}

/** Last week's numbers, read from the views rather than recomputed here. */
async function lastWeek(today: string) {
  const sb = supabaseAdmin();
  const from = shiftDays(isoMonday(today), -7);
  const to = shiftDays(isoMonday(today), -1);

  const [winnersRes, streaksRes, ratingsRes, badgesRes, gamesRes] = await Promise.all([
    sb
      .from("daily_winners")
      .select("player_id, played_on")
      .gte("played_on", from)
      .lte("played_on", to),
    sb.from("player_streaks").select("player_id, current_streak"),
    sb
      .from("rating_events")
      .select("player_id, delta")
      .gte("played_on", from)
      .lte("played_on", to),
    sb
      .from("player_achievements")
      .select("player_id, achievement_key, earned_at")
      .gte("earned_at", `${from}T00:00:00Z`)
      .lte("earned_at", `${to}T23:59:59Z`),
    // daily_winners has a row per winner per day, so counting it would call a
    // three-way tie three games. Count the games.
    sb
      .from("games_valid")
      .select("id", { count: "exact", head: true })
      .gte("played_on", from)
      .lte("played_on", to),
  ]);

  const wins = new Map<string, number>();
  for (const w of (winnersRes.data ?? []) as { player_id: string }[]) {
    wins.set(w.player_id, (wins.get(w.player_id) ?? 0) + 1);
  }
  const gains = new Map<string, number>();
  for (const r of (ratingsRes.data ?? []) as {
    player_id: string;
    delta: number;
  }[]) {
    gains.set(r.player_id, (gains.get(r.player_id) ?? 0) + Number(r.delta));
  }

  // One roster lookup for every name the card might use.
  const ids = new Set<string>([
    ...wins.keys(),
    ...gains.keys(),
    ...((badgesRes.data ?? []) as { player_id: string }[]).map((b) => b.player_id),
    ...((streaksRes.data ?? []) as { player_id: string }[]).map((s) => s.player_id),
  ]);
  const { data: people } = ids.size
    ? await sb.from("players").select("id, name, emoji").in("id", [...ids])
    : { data: [] };
  const who = new Map(
    ((people ?? []) as { id: string; name: string; emoji: string }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  const named = (id: string) => who.get(id) ?? { name: "Someone", emoji: "🎲" };

  const topWin = [...wins.entries()].sort((a, b) => b[1] - a[1])[0];
  const topGain = [...gains.entries()].sort((a, b) => b[1] - a[1])[0];
  const topStreak = ((streaksRes.data ?? []) as {
    player_id: string;
    current_streak: number;
  }[]).sort((a, b) => b.current_streak - a.current_streak)[0];

  // Achievement keys are slugs; the card reads better with the display name.
  const keys = [
    ...new Set(
      ((badgesRes.data ?? []) as { achievement_key: string }[]).map(
        (b) => b.achievement_key,
      ),
    ),
  ];
  const { data: catalog } = keys.length
    ? await sb.from("achievements").select("key, name").in("key", keys)
    : { data: [] };
  const badgeName = new Map(
    ((catalog ?? []) as { key: string; name: string }[]).map((a) => [a.key, a.name]),
  );

  return {
    weekOf: from,
    gamesPlayed: gamesRes.count ?? 0,
    champion: topWin
      ? { ...named(topWin[0]), days: topWin[1] }
      : null,
    longestStreak: topStreak
      ? { ...named(topStreak.player_id), days: topStreak.current_streak }
      : null,
    topGainer: topGain ? { ...named(topGain[0]), delta: topGain[1] } : null,
    badges: (
      (badgesRes.data ?? []) as { player_id: string; achievement_key: string }[]
    ).map((b) => ({
      ...named(b.player_id),
      badge: badgeName.get(b.achievement_key) ?? b.achievement_key,
    })),
  };
}
