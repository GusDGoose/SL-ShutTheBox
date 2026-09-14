import { redirect } from "next/navigation";
import { hasPin, requireIdentityPage } from "@/lib/auth";
import { dayLabel } from "@/lib/dates";
import { stockholmToday } from "@/lib/dates";
import { NewTournamentForm } from "@/components/tournament/new-tournament-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "New team play · Shut the Box" };

/**
 * Starting a team play — the one page under /t that is NOT for guests.
 *
 * [concept: the exempt route that gates itself] /t/* skips both proxy gates so
 * that people with no PIN can join an event. This page creates one, against a
 * real player who will be named in the audit trail, so it checks the PIN and
 * the identity itself. Order matters: the PIN first, because /whoami is behind
 * it and sending somebody there without it is a loop.
 */
export default async function NewTournamentPage() {
  if (!(await hasPin())) redirect("/pin?next=%2Ft%2Fnew");
  await requireIdentityPage("/t/new");

  const today = stockholmToday();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Team play 🎲
        </h1>
        <p className="text-sm text-ink-muted">
          Teams play in parallel, each on its own phone, and the team with the
          lowest average wins. Nothing here touches the daily game — no
          ratings, no badges, no fika.
        </p>
      </div>

      <NewTournamentForm defaultName={`Team play — ${dayLabel(today)}`} />

      <ol className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm text-ink-muted">
        <li>1. Put this page on the big screen and read out the code.</li>
        <li>2. One phone per team joins, names the team and adds its players.</li>
        <li>3. They play with the real dice and tap what went down.</li>
        <li>4. When everybody is done, crown the winners and play the song.</li>
      </ol>
    </main>
  );
}
