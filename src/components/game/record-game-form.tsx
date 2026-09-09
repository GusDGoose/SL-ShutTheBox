"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Board } from "@/components/board/board";
import { MiniBoard } from "@/components/board/mini-board";
import { ScoreReadout } from "@/components/board/score-readout";
import { PlayerPicker } from "@/components/player-picker";
import { Button } from "@/components/ui/button";
import {
  boardTiles,
  maxScoreOf,
  scoreOf,
  tilesOf,
  type Ruleset,
} from "@/lib/rules";
import type { Player } from "@/lib/types";
import {
  addManualGame,
  type ResultInput,
} from "@/app/(focus)/game/[id]/edit/actions";

export type SeasonRules = { starts_on: string; ends_on: string; rules: Ruleset };

/**
 * The rules a game on `date` is scored under.
 *
 * Mirrors add_manual_game exactly: the season containing the date if one
 * exists, otherwise what ensure_season() would create — the default ruleset.
 * The board drawn here has to match what the server will validate against,
 * or a tile count could be right on screen and refused on save.
 */
export function rulesFor(
  date: string,
  seasons: SeasonRules[],
  fallback: Ruleset,
): Ruleset {
  return (
    seasons.find((s) => s.starts_on <= date && date <= s.ends_on)?.rules ??
    fallback
  );
}

// How one player's result is being entered. "typed" keeps the raw text so a
// half-typed number is not clamped out from under the person typing it.
type Entry =
  | { kind: "typed"; text: string }
  | { kind: "tiles"; open: number[] }
  | { kind: "dnp" };

/**
 * Recording a game that was played without the app.
 *
 * The forgotten Friday, or the day the app could not save — the game happened
 * on the real box, so it belongs in the history. Scores can be typed (the
 * usual case, from memory or a photo) or set on the board if the tiles are
 * known. It lands as a finished game with a `game.manual` audit entry naming
 * whoever recorded it.
 */
export function RecordGameForm({
  roster,
  seasons,
  defaultRules,
  today,
}: {
  roster: Player[];
  seasons: SeasonRules[];
  defaultRules: Ruleset;
  today: string;
}) {
  const [date, setDate] = useState(today);
  const [order, setOrder] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rules = rulesFor(date, seasons, defaultRules);
  const max = maxScoreOf(rules);
  const byId = new Map(roster.map((p) => [p.id, p]));

  function toggle(id: string) {
    setOrder((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setEntries((prev) =>
      prev[id] ? prev : { ...prev, [id]: { kind: "typed", text: "" } },
    );
  }

  function setEntry(id: string, entry: Entry) {
    setEntries((prev) => ({ ...prev, [id]: entry }));
  }

  // --- what each row currently amounts to ------------------------------------
  type Row =
    | { id: string; state: "empty" }
    | { id: string; state: "invalid"; message: string }
    | { id: string; state: "ok"; result: ResultInput };

  const rows: Row[] = order.map((id) => {
    const entry = entries[id] ?? { kind: "typed", text: "" };
    const name = byId.get(id)?.name ?? "That player";
    if (entry.kind === "dnp") {
      return {
        id,
        state: "ok",
        result: { playerId: id, status: "dnp", score: null, tilesOpen: null },
      };
    }
    if (entry.kind === "tiles") {
      return {
        id,
        state: "ok",
        result: {
          playerId: id,
          status: "done",
          score: scoreOf(rules, entry.open),
          tilesOpen: entry.open,
        },
      };
    }
    if (entry.text.trim() === "") return { id, state: "empty" };
    const n = Number(entry.text);
    if (!Number.isInteger(n) || n < 0) {
      return { id, state: "invalid", message: `${name}'s score has to be a whole number.` };
    }
    if (n > max) {
      return {
        id,
        state: "invalid",
        message: `${name} cannot score more than ${max} on this board.`,
      };
    }
    return {
      id,
      state: "ok",
      result: { playerId: id, status: "done", score: n, tilesOpen: null },
    };
  });

  const firstProblem = rows.find((r) => r.state === "invalid");
  const somebodyPlayed = rows.some(
    (r) => r.state === "ok" && r.result.status === "done",
  );
  const canSubmit =
    !pending &&
    order.length > 0 &&
    rows.every((r) => r.state === "ok") &&
    somebodyPlayed;

  function submit() {
    setServerError(null);
    const results = rows.flatMap((r) => (r.state === "ok" ? [r.result] : []));
    startTransition(async () => {
      const res = await addManualGame(date, results, note.trim() || undefined);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      router.push(`/game/${res.gameId}`);
    });
  }

  // --- setting one player's tiles on the board -----------------------------
  if (editing) {
    const entry = entries[editing];
    const open = entry?.kind === "tiles" ? entry.open : boardTiles(rules);
    const down = new Set(boardTiles(rules).filter((t) => !open.includes(t)));
    const player = byId.get(editing);

    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
          <span aria-hidden>{player?.emoji}</span> {player?.name}
        </h2>
        <p className="text-sm text-ink-muted">
          Every tile starts up. Tap the ones that went down — the score is
          what is left standing.
        </p>
        <Board
          rules={rules}
          down={down}
          onToggle={(tile) => {
            const next = open.includes(tile)
              ? open.filter((t) => t !== tile)
              : [...open, tile].sort((a, b) => a - b);
            setEntry(editing, { kind: "tiles", open: next });
          }}
        />
        <ScoreReadout
          rules={rules}
          value={scoreOf(rules, open)}
          shut={open.length === 0}
          label="Score"
        />
        <Button onClick={() => setEditing(null)}>Done</Button>
      </div>
    );
  }

  // --- the form ---------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Record a game
        </h1>
        <p className="text-sm text-ink-muted">
          Played on the real box, entered after the fact. It counts like any
          other game, and the history will say who recorded it.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <label htmlFor="played-on" className="eyebrow">
          Played on
        </label>
        <input
          id="played-on"
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="w-48 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2"
        />
        <p className="text-xs text-ink-muted">
          {tilesOf(rules)} tiles · {rules.win === "lowest" ? "lowest" : "highest"}{" "}
          wins on that day.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Who played? (tap in turn order)</h2>
        <PlayerPicker players={roster} selected={order} onToggle={toggle} />
      </section>

      {order.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Scores</h2>
          <ul className="flex flex-col gap-2">
            {order.map((id, i) => {
              const p = byId.get(id);
              const name = p?.name ?? "?";
              const entry = entries[id] ?? { kind: "typed", text: "" };
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-line px-4 py-3"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <span aria-hidden>{p?.emoji}</span>
                  <span className="min-w-20 font-medium">{name}</span>

                  {entry.kind === "dnp" ? (
                    <>
                      <span className="flex-1 text-sm text-ink-muted">
                        never got a turn
                      </span>
                      <Button
                        variant="ghost"
                        aria-label={`${name} did play`}
                        onClick={() => setEntry(id, { kind: "typed", text: "" })}
                      >
                        Undo
                      </Button>
                    </>
                  ) : entry.kind === "tiles" ? (
                    <>
                      <MiniBoard tiles={tilesOf(rules)} open={entry.open} />
                      <span className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums">
                        {scoreOf(rules, entry.open)}
                      </span>
                      <Button
                        variant="secondary"
                        aria-label={`Set ${name}'s tiles`}
                        onClick={() => setEditing(id)}
                      >
                        Change tiles
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Type ${name}'s score instead`}
                        onClick={() => setEntry(id, { kind: "typed", text: "" })}
                      >
                        Type instead
                      </Button>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={max}
                        aria-label={`Score for ${name}`}
                        value={entry.text}
                        onChange={(e) =>
                          setEntry(id, { kind: "typed", text: e.target.value })
                        }
                        className="w-20 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-lg font-bold tabular-nums"
                      />
                      <Button
                        variant="secondary"
                        aria-label={`Set ${name}'s tiles`}
                        onClick={() => setEditing(id)}
                      >
                        Tiles
                      </Button>
                    </>
                  )}

                  {entry.kind !== "dnp" && (
                    <button
                      type="button"
                      aria-label={`${name} never got a turn`}
                      onClick={() => setEntry(id, { kind: "dnp" })}
                      className="ml-auto text-xs font-semibold text-ink-muted hover:text-ink"
                    >
                      No turn
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-muted">
            Type the score, or set the tiles if you know them. &ldquo;No
            turn&rdquo; is for somebody who was at the table when the box was
            shut before they rolled.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="note" className="eyebrow">
          Note (optional)
        </label>
        <input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Played on the real box, the app was down"
          className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm"
        />
      </section>

      {firstProblem && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {firstProblem.message}
        </p>
      )}
      {serverError && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {serverError}
        </p>
      )}

      <Button
        size="lg"
        className="self-start"
        disabled={!canSubmit}
        onClick={submit}
      >
        {pending ? "Recording…" : "Record the game 👑"}
      </Button>
      {order.length === 0 && (
        <p className="text-xs text-ink-muted">Pick who played.</p>
      )}
    </div>
  );
}
