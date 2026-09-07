"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Board } from "@/components/board/board";
import {
  BoardModeToggle,
  type BoardMode,
} from "@/components/board/board-mode-toggle";
import { ScoreKeypad } from "@/components/board/score-keypad";
import { ScoreReadout } from "@/components/board/score-readout";
import { ConnectionDot } from "@/components/game/connection-dot";
import { WalkUpPlayer } from "@/components/game/walk-up-player";
import { ResultsList } from "@/components/game/results-list";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSfx } from "@/components/ui/audio-provider";
import { useToast } from "@/components/ui/toast";
import {
  currentPlayer,
  isStale,
  turnProgress,
  type LiveSnapshot,
} from "@/lib/live";
import { boardTiles, instantWinOf, maxScoreOf, scoreOf } from "@/lib/rules";
import type { Clip } from "@/lib/audio/youtube-api";
import { useLiveGame } from "@/lib/use-live-game";
import {
  abandonGame,
  correctTurn,
  endTurn,
  finishGame,
  setBoard,
} from "@/app/(focus)/game/actions";

type Editing = { playerId: string; down: number[]; typed: boolean };

/**
 * The scorekeeper's view of a live game.
 *
 * The board it draws is the one in the database. Taps are applied locally first
 * so the tile moves under your thumb, then sent as the whole desired set —
 * idempotent, so a retry or two taps racing cannot leave a board nobody chose.
 * The server's reply is the truth and replaces local state once it lands.
 */
export function GameController({
  initial,
  meId,
  walkUps = {},
}: {
  initial: LiveSnapshot;
  meId: string;
  /** Each player's song clip, for the few seconds that open their turn. */
  walkUps?: Record<string, Clip | null>;
}) {
  // Subscribed as well as driving: without this the scorekeeper would never
  // notice being taken over, and would keep tapping a board the server has
  // stopped accepting from them.
  const { snapshot, connection, apply } = useLiveGame(initial.game.id, initial);
  const [localDown, setLocalDown] = useState<number[] | null>(null);
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [mode, setMode] = useState<BoardMode>("board");
  const [confirming, setConfirming] = useState<"abandon" | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { play, muted } = useSfx();
  const toast = useToast();

  // One request at a time, with only the latest desired board queued behind it.
  const inFlight = useRef(false);
  const queued = useRef<number[] | null>(null);

  const rules = snapshot.game.rules;
  const tiles = boardTiles(rules);
  const gameId = snapshot.game.id;
  const player = currentPlayer(snapshot);
  const progress = turnProgress(snapshot);

  const shownDown = localDown ?? snapshot.turn?.tiles_down ?? [];
  const downSet = new Set(shownDown);
  const openTiles = tiles.filter((t) => !downSet.has(t));
  // Scored locally so the readout keeps up with the thumb; the server computes
  // the score that actually gets stored when the turn ends.
  const liveScore = scoreOf(rules, openTiles);
  const shut = openTiles.length === 0;

  const demoted = snapshot.game.scorekeeper_player_id !== meId;
  useEffect(() => {
    if (demoted) router.refresh();
  }, [demoted, router]);

  function fail(message: string) {
    play("error");
    toast({ kind: "error", title: message });
  }

  async function pushBoard(next: number[]) {
    if (inFlight.current) {
      queued.current = next;
      return;
    }
    inFlight.current = true;
    const res = await setBoard(gameId, next);
    inFlight.current = false;

    if (!res.ok) {
      setLocalDown(null); // fall back to whatever the server last told us
      setUndoStack([]);
      queued.current = null;
      fail(res.error);
      router.refresh();
      return;
    }

    apply(res.snapshot);
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
    startTransition(async () => {
      const res = await endTurn(gameId, typedScore ?? null);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      apply(res.snapshot);
      setLocalDown(null);
      setUndoStack([]);
      setMode("board");
    });
  }

  function handleFinish() {
    startTransition(async () => {
      const res = await finishGame(gameId);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      play("fanfare");
      router.push(`/game/${gameId}?crown=1`);
    });
  }

  function handleAbandon() {
    setConfirming(null);
    startTransition(async () => {
      const res = await abandonGame(gameId);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      router.push("/play");
    });
  }

  function startEdit(playerId: string) {
    const row = snapshot.players.find((p) => p.player_id === playerId);
    if (!row) return;
    // A typed score has no board to reopen, so it is corrected by typing again.
    const typed = row.tiles_open === null;
    setEditing({
      playerId,
      down: typed ? [] : tiles.filter((t) => !row.tiles_open!.includes(t)),
      typed,
    });
  }

  function saveEdit(typedScore?: number) {
    if (!editing) return;
    const open = editing.typed
      ? null
      : tiles.filter((t) => !editing.down.includes(t));
    const value = editing.typed ? typedScore! : scoreOf(rules, open!);
    const playerId = editing.playerId;
    startTransition(async () => {
      const res = await correctTurn(gameId, playerId, open, value);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      apply(res.snapshot);
      setEditing(null);
      setLocalDown(null);
    });
  }

  // --- correcting a turn that already happened ----------------------------
  if (editing) {
    const row = snapshot.players.find((p) => p.player_id === editing.playerId)!;
    const editOpen = tiles.filter((t) => !editing.down.includes(t));
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Correcting {row.emoji} {row.name}
        </h1>
        {editing.typed ? (
          <ScoreKeypad
            max={maxScoreOf(rules)}
            submitLabel="Save turn"
            onSubmit={(score) => saveEdit(score)}
          />
        ) : (
          <>
            <Board
              rules={rules}
              down={new Set(editing.down)}
              onToggle={(tile) =>
                setEditing((prev) =>
                  prev
                    ? {
                        ...prev,
                        down: prev.down.includes(tile)
                          ? prev.down.filter((t) => t !== tile)
                          : [...prev.down, tile],
                      }
                    : prev,
                )
              }
            />
            <ScoreReadout
              rules={rules}
              value={scoreOf(rules, editOpen)}
              shut={editOpen.length === 0}
              label="Corrected score"
            />
          </>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          {!editing.typed && (
            <Button disabled={pending} onClick={() => saveEdit()}>
              {pending ? "Saving…" : "Save turn"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- everyone has played: review and crown ------------------------------
  if (snapshot.all_done) {
    const anyShut = snapshot.players.some(
      (p) => p.status === "done" && p.tiles_open?.length === 0,
    );
    const skipped = snapshot.players.filter((p) => p.status === "dnp").length;

    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Scores
        </h1>
        {anyShut && instantWinOf(rules) && (
          <p className="rounded-[var(--radius-card)] border border-shut/50 bg-shut/10 px-4 py-3 text-sm font-medium">
            📦 The box was shut! Game over
            {skipped > 0 &&
              ` — ${skipped} player${skipped === 1 ? "" : "s"} never got a turn`}
            .
          </p>
        )}
        <ResultsList snapshot={snapshot} onCorrect={startEdit} />
        <Button
          size="lg"
          className="self-start"
          disabled={pending}
          onClick={handleFinish}
        >
          {pending ? "Crowning…" : "Finish & crown 👑"}
        </Button>
      </div>
    );
  }

  // --- a turn in progress --------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      {isStale(snapshot) && (
        <p className="rounded-[var(--radius-card)] border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
          This game has been open for a while. Still playing, or should it be
          abandoned?
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">
            Turn {progress.index} of {progress.total}
          </p>
          <p className="text-xl">
            <span aria-hidden className="mr-2 text-3xl">
              {player?.emoji}
            </span>
            <span className="font-bold">{player?.name}</span>
            <span className="text-ink-muted"> is up</span>
          </p>
          {player && walkUps[player.player_id] && (
            <WalkUpPlayer
              key={`${player.player_id}-${progress.index}`}
              clip={walkUps[player.player_id]!}
              playerName={player.name}
              muted={muted}
            />
          )}
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
            Tap the tiles you flipped down on the real box — your score is
            whatever stays up.
          </p>
        </>
      ) : (
        <ScoreKeypad
          max={maxScoreOf(rules)}
          onSubmit={(score) => handleEndTurn(score)}
        />
      )}

      <ResultsList snapshot={snapshot} heading="So far" />

      <button
        type="button"
        onClick={() => setConfirming("abandon")}
        className="self-start text-sm text-ink-muted underline hover:text-ink"
      >
        Abandon this game
      </button>

      <ConfirmDialog
        open={confirming === "abandon"}
        title="Abandon this game?"
        body="It will not count towards anyone's stats. Turns played so far stay in the archive."
        confirmLabel="Abandon"
        danger
        onConfirm={handleAbandon}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
