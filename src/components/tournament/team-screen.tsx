"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { DeadEnd } from "@/components/ui/dead-end";
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

  if (gone) {
    return (
      <DeadEnd
        art="🫥"
        title="This team play was deleted."
        cta={
          <Link href="/" className={buttonClass("secondary")}>
            Shut the Box
          </Link>
        }
      />
    );
  }

  const team = teamById(snapshot, teamId);
  if (!team) {
    return (
      <DeadEnd
        art="🫥"
        title="That team is no longer here."
        cta={
          <Link href={`/t/${code}`} className={buttonClass("secondary")}>
            Back to the lobby
          </Link>
        }
      />
    );
  }

  const rules = snapshot.tournament.rules;
  const shared = { code, team, rules, onSnapshot: apply };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
      {team.status === "playing" ? (
        <TeamBoard {...shared} connection={connection} />
      ) : team.status === "done" ? (
        <TeamDone {...shared} />
      ) : (
        <TeamSetup {...shared} />
      )}
    </main>
  );
}
