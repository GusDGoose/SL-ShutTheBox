"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { TeamBoard } from "@/components/tournament/team-board";
import { TeamDone } from "@/components/tournament/team-done";
import { TeamSetup } from "@/components/tournament/team-setup";
import { teamById, type TournamentSnapshot } from "@/lib/tournament";
import { useLiveTournament } from "@/lib/use-live-tournament";

/**
 * One team's phone, for the whole event.
 *
 * Which of the three screens it shows is decided by the team's status, and that
 * status is derived in SQL from whether a board exists and whether everybody
 * has a score. So adding a late arrival to a finished team puts this phone back
 * on the setup screen without anything here having to know that rule.
 */
export function TeamScreen({
  initial,
  code,
  teamId,
}: {
  initial: TournamentSnapshot;
  code: string;
  teamId: string;
}) {
  const { snapshot, connection, gone, apply } = useLiveTournament(code, initial);
  const router = useRouter();

  const finished = snapshot.tournament.status === "finished";

  // The organiser crowned it from the laptop. Everybody goes to the result,
  // including whoever was mid-turn — their board is gone by then anyway.
  useEffect(() => {
    if (finished) router.replace(`/t/${code}`);
  }, [finished, code, router]);

  const team = teamById(snapshot, teamId);

  if (gone || !team) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <span aria-hidden className="text-5xl">
          🫥
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          {gone ? "This team play was deleted." : "That team is no longer here."}
        </h1>
        <Link href={gone ? "/" : `/t/${code}`} className={buttonClass("secondary")}>
          {gone ? "Shut the Box" : "Back to the lobby"}
        </Link>
      </main>
    );
  }

  const shell = "mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6";
  const rules = snapshot.tournament.rules;

  if (team.status === "playing") {
    return (
      <main className={shell}>
        <TeamBoard
          code={code}
          team={team}
          rules={rules}
          connection={connection}
          onSnapshot={apply}
        />
      </main>
    );
  }

  if (team.status === "done") {
    return (
      <main className={shell}>
        <TeamDone code={code} team={team} rules={rules} onSnapshot={apply} />
      </main>
    );
  }

  return (
    <main className={shell}>
      <TeamSetup code={code} team={team} rules={rules} onSnapshot={apply} />
    </main>
  );
}
