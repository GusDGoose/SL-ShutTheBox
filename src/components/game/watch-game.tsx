"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Board } from "@/components/board/board";
import { ResultsList } from "@/components/game/results-list";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { currentPlayer, isStale, type LiveSnapshot } from "@/lib/live";
import { scoreOf } from "@/lib/rules";
import { claimScorekeeper } from "@/app/(focus)/game/actions";

/**
 * A live game someone else is keeping score for.
 *
 * The board is read-only here, so it renders as images rather than buttons —
 * there is nothing to tab into that you are allowed to press. WP-B7 makes this
 * update by itself; for now it reflects the state at page load, with a refresh
 * button, and the option to take over if the scorekeeper's phone has vanished.
 */
export function WatchGame({
  initial,
  scorekeeperName,
}: {
  initial: LiveSnapshot;
  scorekeeperName: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const player = currentPlayer(initial);
  const down = new Set(initial.turn?.tiles_down ?? []);
  const openTiles = (initial.turn?.tiles_open ?? []) as number[];

  function takeOver() {
    setConfirming(false);
    startTransition(async () => {
      const res = await claimScorekeeper(initial.game.id);
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
      {isStale(initial) && (
        <p className="rounded-[var(--radius-card)] border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
          This game has been open for a while — the phone keeping score may have
          gone home.
        </p>
      )}

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

      <Board rules={initial.game.rules} down={down} />

      {initial.turn && (
        <p className="text-sm text-ink-muted">
          Score if they stop now:{" "}
          <span className="font-bold text-ink tabular-nums">
            {scoreOf(initial.game.rules, openTiles)}
          </span>
        </p>
      )}

      <ResultsList snapshot={initial} heading="So far" />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => router.refresh()}>
          Refresh
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          Take over as scorekeeper
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        {scorekeeperName
          ? `${scorekeeperName} is keeping score.`
          : "Nobody is keeping score."}
      </p>

      <ConfirmDialog
        open={confirming}
        title="Take over as scorekeeper?"
        body={
          scorekeeperName
            ? `${scorekeeperName}'s device becomes a spectator and yours starts driving the board.`
            : "Your device starts driving the board."
        }
        confirmLabel="Take over"
        onConfirm={takeOver}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
