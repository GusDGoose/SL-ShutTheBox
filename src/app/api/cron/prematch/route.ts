import { NextResponse } from "next/server";
import { requireCron, SessionError } from "@/lib/auth";
import { claimCronRun, recordCronResult } from "@/lib/cron";
import { stockholmToday } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";
import { postPrematch } from "@/lib/teams";

export const dynamic = "force-dynamic";

/**
 * 12:40 on a weekday — the reminder that the box is coming out at 12:45.
 *
 * It replaced a 14:00 "nobody played today" nudge, which arrived after the
 * moment it was nudging about. This one is only useful if it is on time, and
 * "on time" here means the minute, which is why the schedule lives in
 * pg_cron (0020) rather than in vercel.json: Vercel Hobby cron fires
 * somewhere inside the hour and cannot express a Stockholm wall-clock time
 * across daylight saving.
 *
 * It does not check whether a game has already been played. At 12:40 nobody
 * has, and a reminder that quietly declines to fire is worse than one too
 * many.
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

  // Same manual re-run hatch as the morning job.
  const asked = new URL(request.url).searchParams.get("on");
  const today = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? asked! : stockholmToday();

  if (!(await claimCronRun("prematch", today))) {
    return NextResponse.json({ ran: false, reason: "already ran today" });
  }

  // A game already in progress means somebody started early; no reminder.
  const { count, error } = await supabaseAdmin()
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("played_on", today)
    .eq("status", "in_progress")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const alreadyPlaying = (count ?? 0) > 0;
  const posted = alreadyPlaying ? false : await postPrematch();
  const outcome = alreadyPlaying
    ? "a game is already under way"
    : posted
      ? "reminder posted"
      : "Teams is not configured";

  const result = { date: today, posted, outcome };
  await recordCronResult("prematch", today, result);
  return NextResponse.json({ ran: true, ...result });
}
