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
import { describeDbError, isConflict } from "@/lib/db-errors";
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
});
