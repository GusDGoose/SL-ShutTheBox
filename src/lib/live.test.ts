import { describe, expect, it } from "vitest";
import {
  currentPlayer,
  isStale,
  parseSnapshot,
  skippedPlayers,
  standings,
  turnProgress,
  STALE_AFTER_MS,
  type LiveSnapshot,
} from "@/lib/live";
import {
  dayGameOf,
  describeDbError,
  describeDbErrorVerbatim,
  isConflict,
  refusal,
} from "@/lib/db-errors";
import { existingGameOf } from "@/lib/action-result";
import type { Ruleset } from "@/lib/rules";

const RULES: Ruleset = {
  v: 1,
  tiles: 12,
  scoring: { kind: "sum_open" },
  win: "lowest",
  shut_box: { instant_win: true },
  dice: { count: 2, one_die_rule: { kind: "when_all_above_shut", threshold: 6 } },
  modifiers: [],
  ties: "share",
  prediction: { enabled: false, sealed: true, penalty: "abs_offset", multiplier: 1 },
  voluntary_stop: { enabled: false },
};

type Overrides = {
  game?: Partial<LiveSnapshot["game"]>;
  players?: LiveSnapshot["players"];
  turn?: LiveSnapshot["turn"];
  leader_ids?: string[];
  all_done?: boolean;
  version?: number;
};

function snapshot(overrides: Overrides = {}): LiveSnapshot {
  return parseSnapshot({
    game: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "in_progress",
      played_on: "2026-09-07",
      ruleset_id: "22222222-2222-4222-8222-222222222222",
      rules: RULES,
      scorekeeper_player_id: "aaa",
      started_at: "2026-09-07T09:00:00Z",
      updated_at: "2026-09-07T09:05:00Z",
      deleted: false,
      ...(overrides.game ?? {}),
    },
    players: overrides.players ?? [
      { player_id: "aaa", name: "Ada", emoji: "🦊", turn_order: 1, status: "done", score: 12, tiles_open: [5, 7], predicted_score: null },
      { player_id: "bbb", name: "Ben", emoji: "🐙", turn_order: 2, status: "playing", score: null, tiles_open: null, predicted_score: null },
      { player_id: "ccc", name: "Cleo", emoji: "🦄", turn_order: 3, status: "pending", score: null, tiles_open: null, predicted_score: null },
    ],
    turn:
      overrides.turn === undefined
        ? {
            player_id: "bbb",
            tiles_down: [1, 2],
            tiles_open: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            score_if_stop: 75,
            is_shut: false,
          }
        : overrides.turn,
    leader_ids: overrides.leader_ids ?? ["aaa"],
    all_done: overrides.all_done ?? false,
    version: overrides.version ?? 7,
  });
}

describe("parseSnapshot", () => {
  it("returns a typed snapshot with parsed rules", () => {
    const s = snapshot();
    expect(s.game.rules.tiles).toBe(12);
    expect(s.players).toHaveLength(3);
  });

  it("refuses a shape it cannot read rather than half-rendering a board", () => {
    expect(() => parseSnapshot(null)).toThrow(/unexpected shape/);
    expect(() => parseSnapshot({})).toThrow(/unexpected shape/);
    expect(() => parseSnapshot({ game: {} })).toThrow(/unexpected shape/);
  });

  it("tolerates missing collections", () => {
    const s = parseSnapshot({
      game: { id: "x", rules: RULES },
      turn: null,
      version: 0,
    });
    expect(s.players).toEqual([]);
    expect(s.leader_ids).toEqual([]);
  });
});

describe("currentPlayer", () => {
  it("is whoever the live board says is up", () => {
    expect(currentPlayer(snapshot())?.name).toBe("Ben");
  });

  it("is nobody once the board is gone", () => {
    expect(currentPlayer(snapshot({ turn: null }))).toBeNull();
  });
});

describe("turnProgress", () => {
  it("counts the turn being played", () => {
    expect(turnProgress(snapshot())).toEqual({ index: 2, total: 3 });
  });

  // Someone the box was shut on never gets a turn, so counting them would
  // promise a turn that is not coming.
  it("leaves out players who were skipped", () => {
    const s = snapshot({
      players: [
        { player_id: "aaa", name: "Ada", emoji: "🦊", turn_order: 1, status: "done", score: 0, tiles_open: [], predicted_score: null },
        { player_id: "bbb", name: "Ben", emoji: "🐙", turn_order: 2, status: "dnp", score: null, tiles_open: null, predicted_score: null },
      ],
      all_done: true,
      turn: null,
    });
    expect(turnProgress(s)).toEqual({ index: 1, total: 1 });
  });
});

describe("standings", () => {
  const done = [
    { player_id: "aaa", name: "Ada", emoji: "🦊", turn_order: 1, status: "done" as const, score: 12, tiles_open: null, predicted_score: null },
    { player_id: "bbb", name: "Ben", emoji: "🐙", turn_order: 2, status: "done" as const, score: 3, tiles_open: null, predicted_score: null },
    { player_id: "ccc", name: "Cleo", emoji: "🦄", turn_order: 3, status: "pending" as const, score: null, tiles_open: null, predicted_score: null },
  ];

  it("puts the lowest score first when the lowest wins", () => {
    expect(standings(snapshot({ players: done })).map((p) => p.name)).toEqual([
      "Ben",
      "Ada",
    ]);
  });

  // The direction comes from the ruleset, so a highest-wins season needs no
  // special case in the UI either.
  it("reverses for a highest-wins ruleset", () => {
    const s = snapshot({
      players: done,
      game: { rules: { ...RULES, win: "highest" } },
    });
    expect(standings(s).map((p) => p.name)).toEqual(["Ada", "Ben"]);
  });

  it("leaves out anyone who has not played", () => {
    expect(standings(snapshot({ players: done }))).toHaveLength(2);
  });
});

describe("skippedPlayers", () => {
  it("finds the players the box was shut on", () => {
    const s = snapshot({
      players: [
        { player_id: "aaa", name: "Ada", emoji: "🦊", turn_order: 1, status: "done", score: 0, tiles_open: [], predicted_score: null },
        { player_id: "bbb", name: "Ben", emoji: "🐙", turn_order: 2, status: "dnp", score: null, tiles_open: null, predicted_score: null },
      ],
    });
    expect(skippedPlayers(s).map((p) => p.name)).toEqual(["Ben"]);
  });
});

describe("isStale", () => {
  const base = new Date("2026-09-07T09:05:00Z").getTime();

  it("is fresh while it is being played", () => {
    expect(isStale(snapshot(), base + 60_000)).toBe(false);
  });

  it("goes stale once it has sat untouched for hours", () => {
    expect(isStale(snapshot(), base + STALE_AFTER_MS + 1000)).toBe(true);
  });

  // A finished game is not stale, it is done.
  it("never applies to a game that is not in progress", () => {
    const finished = snapshot({
      game: { status: "finished" },
    });
    expect(isStale(finished, base + STALE_AFTER_MS * 10)).toBe(false);
  });
});

describe("describeDbError", () => {
  it("explains each refusal the game flow can raise", () => {
    expect(describeDbError({ code: "STB01" })).toMatch(/keeping score/i);
    expect(describeDbError({ code: "STB03" })).toMatch(/not in play/i);
    expect(describeDbError({ code: "STB05" })).toMatch(/nobody has played/i);
    expect(describeDbError({ code: "STB09" })).toMatch(/another game/i);
  });

  // The one-live-game index fires before the function's own check, so the
  // race surfaces as a unique violation rather than our code.
  it("treats a unique violation as the same conflict", () => {
    expect(describeDbError({ code: "23505" })).toBe(
      describeDbError({ code: "STB09" }),
    );
  });

  it("says something useful for anything unrecognised", () => {
    expect(describeDbError({ code: "42P01" })).toMatch(/try again/i);
    expect(describeDbError(null)).toMatch(/try again/i);
  });

  it("knows which errors mean somebody else changed the game", () => {
    expect(isConflict({ code: "STB01" })).toBe(true);
    expect(isConflict({ code: "STB03" })).toBe(true);
    expect(isConflict({ code: "STB02" })).toBe(false);
    expect(isConflict(null)).toBe(false);
  });

  it("prefers the database's own sentence when it wrote one", () => {
    expect(
      describeDbErrorVerbatim({ code: "STB02", message: "add at least one player first" }),
    ).toBe("Add at least one player first.");
    // No STB code means nothing worth quoting, so the table speaks.
    expect(describeDbErrorVerbatim({ code: "42P01", message: "relation x" })).toMatch(
      /try again/i,
    );
    expect(describeDbErrorVerbatim(null)).toMatch(/try again/i);
  });

  it("explains the one-game-a-day refusals", () => {
    expect(describeDbError({ code: "STB13" })).toMatch(/already has its game/i);
    expect(describeDbError({ code: "STB14" })).toMatch(/being played/i);
    expect(isConflict({ code: "STB13" })).toBe(true);
    expect(isConflict({ code: "STB14" })).toBe(true);
  });

  // Two phones crowning two games in the same second: the loser hits the
  // unique index, not the function's check, and must not be told it is
  // "already keeping score".
  it("tells the day's index apart from the one-live-game index", () => {
    expect(
      describeDbError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "games_one_counted_per_day"',
      }),
    ).toBe(describeDbError({ code: "STB13" }));
    expect(
      describeDbError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "games_one_live_per_scorekeeper"',
      }),
    ).toBe(describeDbError({ code: "STB09" }));
  });

  it("names the game that holds the day, when the refusal says which", () => {
    const id = "2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f";
    expect(dayGameOf({ code: "STB13", details: id })).toBe(id);
    expect(dayGameOf({ code: "STB14", details: id })).toBe(id);
    expect(dayGameOf({ code: "STB02", details: id })).toBeNull();
    expect(dayGameOf({ code: "STB13", details: "not an id" })).toBeNull();
    expect(dayGameOf(null)).toBeNull();
  });

  it("turns a refusal into an action result that carries that game", () => {
    const id = "2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f";
    expect(refusal({ code: "STB13", details: id })).toEqual({
      ok: false,
      error: describeDbError({ code: "STB13" }),
      existingGameId: id,
    });
    expect(refusal({ code: "STB02" })).toEqual({
      ok: false,
      error: describeDbError({ code: "STB02" }),
    });
    // …and the page reads it back without caring how it was built.
    expect(existingGameOf(refusal({ code: "STB14", details: id }))).toBe(id);
    expect(existingGameOf(refusal({ code: "STB02" }))).toBeNull();
    expect(existingGameOf({ ok: true })).toBeNull();
  });

  it("has copy for the team-play refusals, aimed at people new to the app", () => {
    expect(describeDbError({ code: "STB10" })).toMatch(/code/i);
    expect(describeDbError({ code: "STB11" })).toMatch(/finished/i);
    expect(describeDbError({ code: "STB12" })).toMatch(/reload/i);
  });
});
