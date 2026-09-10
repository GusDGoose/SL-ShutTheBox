import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * [concept: idempotency guard] Vercel Hobby fires a cron anywhere inside its
 * scheduled hour and offers no exactly-once guarantee, so a job can arrive
 * twice. The morning job posts to the team's channel, and a digest posted
 * twice is worse than one posted late.
 *
 * `claim` inserts the day's row and returns false if it was already there.
 * The insert is the lock — a check-then-act would race with itself.
 */
export type CronJob = "morning" | "afternoon";

export async function claimCronRun(
  job: CronJob,
  runDate: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("cron_runs")
    .insert({ job, run_date: runDate })
    .select("job")
    .maybeSingle();

  // 23505 = already ran today. Anything else is a real problem.
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return data !== null;
}

/** Record what the run decided, for the next person wondering why. */
export async function recordCronResult(
  job: CronJob,
  runDate: string,
  result: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin()
    .from("cron_runs")
    .update({ result })
    .eq("job", job)
    .eq("run_date", runDate);
}
