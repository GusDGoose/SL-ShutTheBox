"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Board } from "@/components/board/board";
import { ConnectionDot } from "@/components/game/connection-dot";
import { ResultsList } from "@/components/game/results-list";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { currentPlayer, isStale, type LiveSnapshot } from "@/lib/live";
import { scoreLabel } from "@/lib/rules";
import { useLiveGame } from "@/lib/use-live-game";
import { claimScorekeeper } from "@/app/(focus)/game/actions";

/**
 * A live game somebody else is keeping score for.
 *
 * The tiles flip here as they are tapped on the scorekeeper's phone. The board
 * is read-only, so it renders as images rather than buttons — there is nothing
 * to tab into that this device is allowed to press.
 */
export function WatchGame({
  initial,
  scorekeeperName,
}: {
  initial: LiveSnapshot;
  scorekeeperName: string | null;
}) {
  const { snapshot, connection } = useLiveGame(initial.game.id, initial);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const player = currentPlayer(snapshot);
  const down = new Set(snapshot.turn?.tiles_down ?? []);

  // The scorekeeper's name comes from the server render; if they hand over
  // mid-game the snapshot knows the new one before the page re-renders.
  const keeper =
    snapshot.players.find(
      (p) => p.player_id === snapshot.game.scorekeeper_player_id,
    )?.name ?? scorekeeperName;

  // A game that finishes under us becomes the celebration, which is a server
  // render rather than anything this component can draw. In an effect, not in
  // the render body: refreshing during render re-runs the render, forever.
  const finished = snapshot.game.status !== "in_progress";
  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);

  function takeOver() {
    setConfirming(false);
    startTransition(async () => {
      const res = await claimScorekeeper(snapshot.game.id);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      toast({ kind: "success", title: "You are keeping score now." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {isStale(snapshot) && (
        <p className="rounded-[var(--radius-card)] border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
          This game has been open for a while — the phone keeping score may have
          gone home.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Watching</p>
          <p className="text-xl">
            <span aria-hidden className="mr-2 text-3xl">
              {player?.emoji}
            </span>
            <span className="font-bold">{player?.name}</span>
            <span className="text-ink-muted"> is up</span>
          </p>
        </div>
        <ConnectionDot state={connection} />
      </div>

      {/* Announced so the board is followable without watching it. */}
      <p className="sr-only" aria-live="polite">
        {player ? `${player.name} is up.` : "Waiting for the next turn."}
      </p>

      <Board rules={snapshot.game.rules} down={down} />

      {snapshot.turn && (
        <p className="text-sm text-ink-muted">
          {scoreLabel(snapshot.game.rules).replace("you stop", "they stop")}:{" "}
          <span className="font-bold text-ink tabular-nums">
            {snapshot.turn.score_if_stop}
          </span>
          {snapshot.turn.is_shut && " — the box is shut 📦"}
        </p>
      )}

      <ResultsList snapshot={snapshot} heading="So far" />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          Take over as scorekeeper
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        {keeper ? `${keeper} is keeping score.` : "Nobody is keeping score."}
      </p>

      <ConfirmDialog
        open={confirming}
        title="Take over as scorekeeper?"
        body={
          keeper
            ? `${keeper}'s device becomes a spectator and yours starts driving the board.`
            : "Your device starts driving the board."
        }
        confirmLabel="Take over"
        onConfirm={takeOver}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
