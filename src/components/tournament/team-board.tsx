"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Undo2 } from "lucide-react";
import { Board } from "@/components/board/board";
import {
  BoardModeToggle,
  type BoardMode,
} from "@/components/board/board-mode-toggle";
import { ScoreKeypad } from "@/components/board/score-keypad";
import { ScoreReadout } from "@/components/board/score-readout";
import { ConnectionDot } from "@/components/game/connection-dot";
import { MemberList } from "@/components/tournament/member-list";
import { Button, buttonClass } from "@/components/ui/button";
import { useSfx } from "@/components/ui/audio-provider";
import { useToast } from "@/components/ui/toast";
import { endTeamTurn, setTeamBoard } from "@/app/(public)/t/actions";
import { boardTiles, maxScoreOf, scoreOf, type Ruleset } from "@/lib/rules";
import {
  liveMember,
  teamProgress,
  type TournamentSnapshot,
  type TournamentTeam,
} from "@/lib/tournament";
import type { Connection } from "@/lib/use-live-game";

/**
 * A team's turn, on the team's own phone.
 *
 * The board it draws is the one in the database. Taps land locally first so the
 * tile moves under a thumb, then go up as the whole desired set — idempotent,
 * so a retry or two taps racing cannot leave a board nobody chose.
 */
export function TeamBoard({
  code,
  team,
  rules,
  connection,
  onSnapshot,
}: {
  code: string;
  team: TournamentTeam;
  rules: Ruleset;
  connection: Connection;
  onSnapshot: (snapshot: TournamentSnapshot) => void;
}) {
  const [localDown, setLocalDown] = useState<number[] | null>(null);
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const [mode, setMode] = useState<BoardMode>("board");
  const [pending, startTransition] = useTransition();
  const { play } = useSfx();
  const toast = useToast();

  // One request at a time, with only the latest desired board queued behind it.
  const inFlight = useRef(false);
  const queued = useRef<number[] | null>(null);
  /**
   * [concept: taps belong to a turn] Bumped whenever the turn moves on. A tap
   * queued behind an in-flight request used to survive "End turn" in the daily
   * game and land on the NEXT player's board — the server accepted it, because
   * by then it was a legitimately newer write, and that player started with
   * somebody else's tiles down. Carried over here rather than rediscovered.
   */
  const epoch = useRef(0);

  const tiles = boardTiles(rules);
  const up = liveMember(team);
  const progress = teamProgress(team);

  const shownDown = localDown ?? team.live?.tiles_down ?? [];
  const downSet = new Set(shownDown);
  const openTiles = tiles.filter((t) => !downSet.has(t));
  // Scored locally so the readout keeps up with the thumb; the server computes
  // the score that actually gets stored when the turn ends.
  const liveScore = scoreOf(rules, openTiles);
  const shut = openTiles.length === 0;

  function fail(message: string) {
    play("error");
    toast({ kind: "error", title: message });
  }

  async function pushBoard(next: number[]) {
    const mine = epoch.current;
    if (inFlight.current) {
      queued.current = next;
      return;
    }
    inFlight.current = true;
    const res = await setTeamBoard(code, team.id, next);
    inFlight.current = false;

    // The turn ended while this was in the air: neither the reply nor anything
    // queued behind it belongs to the board now on screen.
    if (mine !== epoch.current) {
      queued.current = null;
      return;
    }

    if (!res.ok) {
      setLocalDown(null); // fall back to whatever the server last told us
      setUndoStack([]);
      queued.current = null;
      fail(res.error);
      return;
    }

    onSnapshot(res.snapshot);
    if (queued.current === null) {
      setLocalDown(null);
      return;
    }
    const following = queued.current;
    queued.current = null;
    void pushBoard(following);
  }

  function toggle(tile: number) {
    const isDown = downSet.has(tile);
    const next = isDown
      ? shownDown.filter((t) => t !== tile)
      : [...shownDown, tile];
    play(isDown ? "tileUp" : next.length === tiles.length ? "shut" : "tileDown");
    setUndoStack((prev) => [...prev, shownDown]);
    setLocalDown(next);
    void pushBoard(next);
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    play("tileUp");
    setUndoStack((prev) => prev.slice(0, -1));
    setLocalDown(previous);
    void pushBoard(previous);
  }

  function handleEndTurn(typedScore?: number) {
    play("endTurn");
    // Abandon any tap still in flight or queued: it was aimed at the turn that
    // is ending, not at the one about to start.
    epoch.current += 1;
    queued.current = null;
    startTransition(async () => {
      const res = await endTeamTurn(code, team.id, typedScore ?? null);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      onSnapshot(res.snapshot);
      setLocalDown(null);
      setUndoStack([]);
      setMode("board");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">
            <span aria-hidden>{team.emoji}</span> {team.name} · turn{" "}
            {progress.index} of {progress.total}
          </p>
          <p className="truncate text-xl">
            <span className="font-bold">{up?.name}</span>
            <span className="text-ink-muted"> is up</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionDot state={connection} />
          <BoardModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      {connection === "offline" && (
        <p className="rounded-[var(--radius-card)] border border-danger/50 bg-danger/10 px-4 py-3 text-sm">
          Offline — showing the last board we could confirm. Taps will not save
          until the connection is back.
        </p>
      )}

      {mode === "board" ? (
        <>
          <Board rules={rules} down={downSet} onToggle={toggle} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <ScoreReadout rules={rules} value={liveScore} shut={shut} />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={undoStack.length === 0}
                onClick={undo}
              >
                <Undo2 aria-hidden size={16} /> Undo tap
              </Button>
              <Button
                size="lg"
                disabled={pending || connection === "offline"}
                onClick={() => handleEndTurn()}
              >
                End turn →
              </Button>
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            Tap the tiles you flipped down on the real box — the score is
            whatever stays up.
          </p>
        </>
      ) : (
        <ScoreKeypad
          max={maxScoreOf(rules)}
          onSubmit={(score) => handleEndTurn(score)}
        />
      )}

      <MemberList
        code={code}
        team={team}
        rules={rules}
        onSnapshot={onSnapshot}
        heading="The team"
        addLabel="Add late"
      />

      <Link href={`/t/${code}`} className={`${buttonClass("ghost")} self-start`}>
        ‹ Lobby
      </Link>
    </div>
  );
}
