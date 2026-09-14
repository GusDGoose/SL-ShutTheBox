"use client";

import { type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConnectionDot } from "@/components/game/connection-dot";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CreateTeamForm } from "@/components/tournament/create-team-form";
import { TeamCard } from "@/components/tournament/team-card";
import { useMyTeam } from "@/components/tournament/my-team";
import { deleteTournament, finishTournament } from "@/app/(public)/t/actions";
import { allTeamsDone, type TournamentSnapshot } from "@/lib/tournament";
import type { Connection } from "@/lib/use-live-game";

/**
 * The room's shared screen while the event is running.
 *
 * Teams are listed in the order they were created, NOT by score. The lobby is
 * on a projector for half an hour while people play; a list that reshuffles
 * itself every time somebody ends a turn is impossible to find your own team
 * in. Ranking is the result page's job, once.
 */
export function Lobby({
  snapshot,
  connection,
  joinPanel,
  canOrganize,
  onSnapshot,
}: {
  snapshot: TournamentSnapshot;
  connection: Connection;
  /** Rendered on the server, because the QR code is. */
  joinPanel: ReactNode;
  canOrganize: boolean;
  onSnapshot: (snapshot: TournamentSnapshot) => void;
}) {
  const [confirming, setConfirming] = useState<"finish" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const myTeam = useMyTeam(snapshot.tournament.code);

  const { code } = snapshot.tournament;
  const { counts } = snapshot;
  const everybodyDone = allTeamsDone(snapshot);
  const anybodyPlayed = counts.ranked > 0;

  const unfinished = snapshot.teams
    .filter((t) => t.status !== "done")
    .map((t) => t.name);

  function handleFinish() {
    setConfirming(null);
    startTransition(async () => {
      const res = await finishTournament(code);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
    });
  }

  function handleDelete() {
    setConfirming(null);
    startTransition(async () => {
      const res = await deleteTournament(code);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      router.push("/");
    });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-start">
      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:w-80 lg:shrink-0">
        {joinPanel}
        <CreateTeamForm code={code} onSnapshot={onSnapshot} />
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
            {counts.teams === 1 ? "1 team" : `${counts.teams} teams`}
            {counts.teams > 0 && (
              <span className="ml-2 text-base font-normal text-ink-muted">
                {counts.done} done
              </span>
            )}
          </h2>
          <ConnectionDot state={connection} />
        </div>

        {counts.teams === 0 ? (
          <EmptyState
            art="🎲"
            title="No teams yet"
            body="Share the code. The first phone to open the link makes the first team."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {snapshot.teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                rules={snapshot.tournament.rules}
                code={code}
                isMine={team.id === myTeam}
              />
            ))}
          </ul>
        )}

        {canOrganize && (
          <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brass/40 bg-brass/5 p-4">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Running the event</span>
              <p className="text-sm text-ink-muted">
                {!anybodyPlayed
                  ? "Nobody has played yet."
                  : everybodyDone
                    ? "Every team has finished. Crown them."
                    : `${counts.done} of ${counts.teams} teams have finished.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={pending || !anybodyPlayed}
                onClick={() =>
                  everybodyDone ? handleFinish() : setConfirming("finish")
                }
              >
                {pending ? "Crowning…" : "Finish & crown 👑"}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirming("delete")}
              >
                Delete this team play
              </Button>
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirming === "finish"}
        title="Crown it now?"
        body={
          unfinished.length > 0
            ? `${unfinished.join(", ")} ${
                unfinished.length === 1 ? "has" : "have"
              } not finished. Only the rounds already played will count towards their score.`
            : "This ends the event for everybody."
        }
        confirmLabel="Finish & crown"
        onConfirm={handleFinish}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title="Delete this team play?"
        body="Every team, every score and every board goes with it. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
