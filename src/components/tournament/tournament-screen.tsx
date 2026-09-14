"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Lobby } from "@/components/tournament/lobby";
import { Results } from "@/components/tournament/results";
import type { TournamentSnapshot } from "@/lib/tournament";
import { useLiveTournament } from "@/lib/use-live-tournament";

/**
 * One URL for the whole event, whether it is being played or already crowned.
 *
 * [concept: the room turns together] The organiser presses "Finish & crown" on
 * a laptop, and every phone in the room is looking at this component. Because
 * the switch is driven by the snapshot's status rather than by a navigation,
 * nobody has to be told to reload — the lobby becomes the result under them,
 * which is the moment the whole thing is for.
 */
export function TournamentScreen({
  initial,
  joinPanel,
  canOrganize,
}: {
  initial: TournamentSnapshot;
  joinPanel: ReactNode;
  canOrganize: boolean;
}) {
  const { snapshot, connection, gone, apply } = useLiveTournament(
    initial.tournament.code,
    initial,
  );

  if (gone) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <span aria-hidden className="text-5xl">
          🫥
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          This team play was deleted.
        </h1>
        <p className="text-sm text-ink-muted">
          Whoever set it up has cleared it away.
        </p>
        <Link href="/" className={buttonClass("secondary")}>
          Shut the Box
        </Link>
      </main>
    );
  }

  if (snapshot.tournament.status === "finished") {
    return <Results snapshot={snapshot} canOrganize={canOrganize} />;
  }

  return (
    <Lobby
      snapshot={snapshot}
      connection={connection}
      joinPanel={joinPanel}
      canOrganize={canOrganize}
      onSnapshot={apply}
    />
  );
}
