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
import { ScorePad } from "./score-pad";
import { TileBoard } from "./tile-board";

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
  | { type: "endTurn"; entry: SaveGameEntry }
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
      // Shut the box (score 0) ends the game instantly — remaining players
      // never get a turn and are simply not saved.
      const gameOver =
        action.entry.score === 0 || state.current + 1 >= state.order.length;
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

const MAX_TILE = 12;
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

// One player's turn: tile board (default) or manual score pad.
function TurnPanel({
  player,
  initial,
  onDone,
  onCancel,
}: {
  player: Player;
  initial: SaveGameEntry | null;
  onDone: (entry: SaveGameEntry) => void;
  onCancel: (() => void) | null;
}) {
  const [mode, setMode] = useState<"board" | "pad">(
    initial && initial.tilesOpen === null ? "pad" : "board",
  );
  const [tilesDown, setTilesDown] = useState<Set<number>>(() => {
    if (initial?.tilesOpen) {
      const open = new Set(initial.tilesOpen);
      return new Set(range(MAX_TILE).filter((t) => !open.has(t)));
    }
    return new Set();
  });

  const total = (MAX_TILE * (MAX_TILE + 1)) / 2;
  const openTiles = range(MAX_TILE).filter((t) => !tilesDown.has(t));
  const liveScore = openTiles.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-xl">
          <span className="mr-2 text-3xl">{player.emoji}</span>
          <span className="font-bold">{player.name}</span>
          <span className="opacity-60"> is up</span>
        </div>
        <div className="flex rounded-lg border border-black/15 text-sm dark:border-white/15">
          {(["board", "pad"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 first:rounded-l-lg last:rounded-r-lg ${
                mode === m ? "bg-foreground font-semibold text-background" : "opacity-60"
              }`}
            >
              {m === "board" ? "Board" : "Type score"}
            </button>
          ))}
        </div>
      </div>

      {mode === "board" ? (
        <>
          <TileBoard
            tilesDown={tilesDown}
            onToggle={(tile) =>
              setTilesDown((prev) => {
                const next = new Set(prev);
                if (next.has(tile)) next.delete(tile);
                else next.add(tile);
                return next;
              })
            }
          />
          <div className="flex items-center justify-between">
            <p className="text-lg">
              Score if you stop now:{" "}
              <span className={`font-bold ${liveScore === 0 ? "text-green-600" : ""}`}>
                {liveScore}
              </span>
              {liveScore === 0 && " — SHUT THE BOX! 📦"}
            </p>
            <div className="flex gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg px-4 py-2 text-sm opacity-70 hover:opacity-100"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onDone({ playerId: player.id, score: liveScore, tilesOpen: openTiles })
                }
                className="rounded-lg bg-foreground px-5 py-2 font-semibold text-background active:scale-95"
              >
                End turn
              </button>
            </div>
          </div>
          <p className="text-xs opacity-50">
            Tap the tiles you flipped down on the real box — score is what stays up.
          </p>
        </>
      ) : (
        <div className="flex items-end gap-3">
          <ScorePad
            maxScore={total}
            onSubmit={(score) =>
              onDone({ playerId: player.id, score, tilesOpen: null })
            }
          />
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-sm opacity-70 hover:opacity-100"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function GameScreen({
  players,
  gamesToday,
}: {
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
          className="self-start rounded-2xl bg-foreground px-8 py-4 text-lg font-semibold text-background disabled:opacity-40"
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
          // key resets the panel's internal state for each new turn / edit
          key={state.editing ?? `turn-${state.current}`}
          player={player}
          initial={editingEntry}
          onDone={(entry) => dispatch({ type: "endTurn", entry })}
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
                  {e.tilesOpen === null && (
                    <span className="ml-2 text-xs opacity-50">(typed)</span>
                  )}
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
        className="self-start rounded-2xl bg-foreground px-8 py-4 text-lg font-semibold text-background disabled:opacity-50"
      >
        {pending ? "Saving…" : "Finish & crown 👑"}
      </button>
    </div>
  );
}
