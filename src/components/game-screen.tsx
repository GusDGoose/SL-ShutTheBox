"use client";

import { useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/types";
import {
  saveGame,
  type SaveGameEntry,
  type SaveGameResult,
} from "@/app/(shell)/play/actions";
import { PlayerPicker } from "./player-picker";
import { Board } from "./board/board";
import { BoardModeToggle, type BoardMode } from "./board/board-mode-toggle";
import { MiniBoard } from "./board/mini-board";
import { ScoreKeypad } from "./board/score-keypad";
import { ScoreReadout } from "./board/score-readout";
import { useSfx } from "./ui/audio-provider";
import { Button, buttonClass } from "./ui/button";
import {
  boardTiles,
  instantWinOf,
  isShutBox,
  maxScoreOf,
  scoreOf,
  tilesOf,
  type Ruleset,
} from "@/lib/rules";

// [concept: reducer state machine] The whole in-progress game lives in this
// client-side reducer — setup → playing (one turn per player) → review.
// Nothing touches the database until "Finish & crown" calls saveGame once.

type State = {
  phase: "setup" | "playing" | "review";
  order: string[]; // player ids, pick order = turn order
  current: number; // whose turn (index into order)
  editing: number | null; // index into entries when re-editing from review
  entries: SaveGameEntry[];
};

type Action =
  | { type: "togglePlayer"; id: string }
  | { type: "start" }
  | { type: "endTurn"; entry: SaveGameEntry; endsGame: boolean }
  | { type: "edit"; index: number }
  | { type: "cancelEdit" };

const initialState: State = {
  phase: "setup",
  order: [],
  current: 0,
  editing: null,
  entries: [],
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "togglePlayer": {
      const order = state.order.includes(action.id)
        ? state.order.filter((x) => x !== action.id)
        : [...state.order, action.id];
      return { ...state, order };
    }
    case "start":
      if (state.order.length === 0) return state;
      return { ...state, phase: "playing", current: 0, entries: [], editing: null };
    case "endTurn": {
      if (state.editing !== null) {
        const entries = state.entries.map((e, i) =>
          i === state.editing ? action.entry : e,
        );
        return { ...state, entries, editing: null, phase: "review" };
      }
      const entries = [...state.entries, action.entry];
      // Whether shutting the box ends the game is a ruleset question, so the
      // turn panel decides it — a highest-wins season would read a 0 as the
      // worst possible turn, not an instant win.
      const gameOver = action.endsGame || state.current + 1 >= state.order.length;
      return gameOver
        ? { ...state, entries, phase: "review" }
        : { ...state, entries, current: state.current + 1 };
    }
    case "edit":
      return { ...state, phase: "playing", editing: action.index };
    case "cancelEdit":
      return { ...state, phase: "review", editing: null };
  }
}

// One player's turn: the board, or the keypad when the game was already played
// on the real box.
function TurnPanel({
  rules,
  player,
  initial,
  onDone,
  onCancel,
}: {
  rules: Ruleset;
  player: Player;
  initial: SaveGameEntry | null;
  onDone: (entry: SaveGameEntry, endsGame: boolean) => void;
  onCancel: (() => void) | null;
}) {
  const { play } = useSfx();
  const tiles = boardTiles(rules);

  const [mode, setMode] = useState<BoardMode>(
    initial && initial.tilesOpen === null ? "keypad" : "board",
  );
  const [down, setDown] = useState<Set<number>>(() => {
    if (initial?.tilesOpen) {
      const open = new Set(initial.tilesOpen);
      return new Set(tiles.filter((t) => !open.has(t)));
    }
    return new Set();
  });

  const openTiles = tiles.filter((t) => !down.has(t));
  const liveScore = scoreOf(rules, openTiles);
  const shut = isShutBox(openTiles);

  function toggle(tile: number) {
    setDown((prev) => {
      const next = new Set(prev);
      if (next.has(tile)) {
        next.delete(tile);
        play("tileUp");
      } else {
        next.add(tile);
        // The last tile going down gets the slam and the bell instead.
        play(next.size === tiles.length ? "shut" : "tileDown");
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xl">
          <span className="mr-2 text-3xl">{player.emoji}</span>
          <span className="font-bold">{player.name}</span>
          <span className="text-ink-muted"> is up</span>
        </div>
        <BoardModeToggle mode={mode} onChange={setMode} />
      </div>

      {mode === "board" ? (
        <>
          <Board rules={rules} down={down} onToggle={toggle} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <ScoreReadout rules={rules} value={liveScore} shut={shut} />
            <div className="flex gap-2">
              {onCancel && (
                <Button variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => {
                  play("endTurn");
                  onDone(
                    { playerId: player.id, score: liveScore, tilesOpen: openTiles },
                    shut && instantWinOf(rules),
                  );
                }}
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
        <div className="flex flex-col gap-3">
          <ScoreKeypad
            max={maxScoreOf(rules)}
            onSubmit={(score) =>
              onDone(
                { playerId: player.id, score, tilesOpen: null },
                score === 0 && instantWinOf(rules),
              )
            }
          />
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function GameScreen({
  rules,
  players,
  gamesToday,
}: {
  rules: Ruleset; // the current season's ruleset
  players: Player[]; // active roster
  gamesToday: number;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byId = new Map(players.map((p) => [p.id, p]));
  const shutBox = state.entries.some((e) => e.score === 0);
  const skipped =
    state.phase === "review" ? state.order.length - state.entries.length : 0;

  function finish() {
    startTransition(async () => {
      const res: SaveGameResult = await saveGame({
        entries: state.entries,
      });
      if ("error" in res) setError(res.error);
      else router.push(`/game/${res.gameId}`);
    });
  }

  if (state.phase === "setup") {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">New game</h1>
        {gamesToday > 0 && (
          <p className="rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ Today already has {gamesToday === 1 ? "a game" : `${gamesToday} games`} —
            you can still play another; every game counts toward the day&apos;s win.
          </p>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Who&apos;s playing? (tap in turn order)
          </h2>
          <PlayerPicker
            players={players}
            selected={state.order}
            onToggle={(id) => dispatch({ type: "togglePlayer", id })}
          />
        </section>
        <button
          type="button"
          disabled={state.order.length === 0}
          onClick={() => dispatch({ type: "start" })}
          className={`${buttonClass("primary", "lg")} self-start`}
        >
          Roll the dice 🎲
        </button>
      </div>
    );
  }

  if (state.phase === "playing") {
    const editingEntry = state.editing !== null ? state.entries[state.editing] : null;
    const playerId = editingEntry
      ? editingEntry.playerId
      : state.order[state.current];
    const player = byId.get(playerId);
    if (!player) return null; // can't happen: order comes from the roster

    return (
      <div className="flex flex-col gap-4">
        {state.editing === null && (
          <p className="text-sm opacity-60">
            Turn {state.current + 1} of {state.order.length}
          </p>
        )}
        <TurnPanel
          rules={rules}
          // key resets the panel's internal state for each new turn / edit
          key={state.editing ?? `turn-${state.current}`}
          player={player}
          initial={editingEntry}
          onDone={(entry, endsGame) =>
            dispatch({ type: "endTurn", entry, endsGame })
          }
          onCancel={
            state.editing !== null ? () => dispatch({ type: "cancelEdit" }) : null
          }
        />
      </div>
    );
  }

  // review
  const best = Math.min(...state.entries.map((e) => e.score));
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Scores</h1>
      {shutBox && (
        <p className="rounded-xl bg-green-100 px-4 py-3 text-sm font-medium text-green-900 dark:bg-green-950 dark:text-green-200">
          📦 THE BOX WAS SHUT! Game over{skipped > 0 &&
            ` — ${skipped} player${skipped === 1 ? "" : "s"} never got a turn`}.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {state.entries.map((e, i) => {
          const p = byId.get(e.playerId);
          return (
            <li key={e.playerId}>
              <button
                type="button"
                onClick={() => dispatch({ type: "edit", index: i })}
                className="flex w-full items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-left hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
              >
                <span>
                  <span className="mr-2">{p?.emoji}</span>
                  <span className="font-medium">{p?.name}</span>
                  <MiniBoard
                    tiles={tilesOf(rules)}
                    open={e.tilesOpen}
                    className="ml-2 inline-block align-middle"
                  />
                </span>
                <span className="text-xl font-bold">
                  {e.score === 0 ? "📦 0" : e.score}
                  {e.score === best && state.entries.length > 1 && " 👑"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs opacity-50">Tap a row to correct it.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={finish}
        className={`${buttonClass("primary", "lg")} self-start`}
      >
        {pending ? "Saving…" : "Finish & crown 👑"}
      </button>
    </div>
  );
}
