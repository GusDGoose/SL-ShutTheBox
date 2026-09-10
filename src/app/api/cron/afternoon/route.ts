import { NextResponse } from "next/server";
import { requireCron, SessionError } from "@/lib/auth";
import { claimCronRun, recordCronResult } from "@/lib/cron";
import { stockholmToday } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";
import { postNudge } from "@/lib/teams";

export const dynamic = "force-dynamic";

/**
 * The weekday afternoon nudge.
 *
 * Scheduled at 12:00 UTC — 13:00 or 14:00 in Stockholm depending on the
 * season — which is deliberately AFTER the usual 12:45 game. If a game has
 * already been played the winner card went out at the crowning and this does
 * nothing; if the box never came out, it asks.
 *
 * A game in progress counts as played: nudging a table mid-game would be
 * both wrong and slightly insulting.
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

  // Same manual re-run hatch as the morning job; see that route.
  const asked = new URL(request.url).searchParams.get("on");
  const today = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? asked! : stockholmToday();
  if (!(await claimCronRun("afternoon", today))) {
    return NextResponse.json({ ran: false, reason: "already ran today" });
  }

  const { count, error } = await supabaseAdmin()
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("played_on", today)
    .in("status", ["in_progress", "finished"])
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  // Three different outcomes that all used to report `nudged: false`: a game
  // was played, or none was and the card went out, or none was and Teams is
  // not configured. The log has to tell them apart.
  const played = (count ?? 0) > 0;
  const posted = played ? false : await postNudge();
  const outcome = played
    ? "a game was already played"
    : posted
      ? "nudge posted"
      : "nobody played, but Teams is not configured";

  const result = { date: today, gamesToday: count ?? 0, nudged: posted, outcome };
  await recordCronResult("afternoon", today, result);
  return NextResponse.json({ ran: true, ...result });
}
