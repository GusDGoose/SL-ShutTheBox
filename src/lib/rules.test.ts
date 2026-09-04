import { describe, expect, it } from "vitest";
import {
  boardTiles,
  describeRules,
  instantWinOf,
  isShutBox,
  maxScoreOf,
  parseRuleset,
  predictionEnabled,
  scoreLabel,
  scoreOf,
  winSignOf,
  type Ruleset,
} from "@/lib/rules";

// The three rulesets seeded by 0004. Every expected value below is the same one
// asserted in supabase/tests/0004_rulesets_seasons.sql — that pairing is what
// keeps the browser's live score and the server's stored score in agreement.
const VANILLA: Ruleset = {
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

const CALL_YOUR_SHOT: Ruleset = {
  ...VANILLA,
  prediction: { enabled: true, sealed: true, penalty: "abs_offset", multiplier: 1 },
};

const DIGITAL_9: Ruleset = {
  ...VANILLA,
  tiles: 9,
  scoring: { kind: "concat_open" },
};

describe("scoreOf — sum scoring", () => {
  it("adds the open tiles", () => {
    expect(scoreOf(VANILLA, [3, 5])).toBe(8);
  });

  it("scores a shut box as zero", () => {
    expect(scoreOf(VANILLA, [])).toBe(0);
    expect(isShutBox([])).toBe(true);
  });

  it("scores an untouched board as 78", () => {
    expect(scoreOf(VANILLA, boardTiles(VANILLA))).toBe(78);
  });
});

describe("scoreOf — digital scoring", () => {
  it("reads the open tiles as one number", () => {
    expect(scoreOf(DIGITAL_9, [3, 5])).toBe(35);
  });

  it("is independent of the order the tiles arrive in", () => {
    expect(scoreOf(DIGITAL_9, [5, 3])).toBe(35);
  });

  it("does not mutate the caller's array while sorting", () => {
    const tiles = [5, 3];
    scoreOf(DIGITAL_9, tiles);
    expect(tiles).toEqual([5, 3]);
  });

  it("scores a shut box as zero", () => {
    expect(scoreOf(DIGITAL_9, [])).toBe(0);
  });
});

describe("scoreOf — call your shot", () => {
  it("charges nothing for a perfect call", () => {
    expect(scoreOf(CALL_YOUR_SHOT, [3, 5], 8)).toBe(8);
  });

  it("adds the gap when you undershoot", () => {
    expect(scoreOf(CALL_YOUR_SHOT, [3, 5], 3)).toBe(13);
  });

  it("adds the same gap when you overshoot", () => {
    expect(scoreOf(CALL_YOUR_SHOT, [3, 5], 20)).toBe(20);
  });

  // The reason the offset is absolute rather than signed: a signed offset lets
  // you call 78, score 8, and finish 62 under par — winning every game.
  it("never lets a wild call beat the base score", () => {
    expect(scoreOf(CALL_YOUR_SHOT, [3, 5], 78)).toBe(78);
    expect(scoreOf(CALL_YOUR_SHOT, [3, 5], 78)).toBeGreaterThanOrEqual(0);
  });

  it("multiplies the gap when the ruleset says so", () => {
    const doubled: Ruleset = {
      ...CALL_YOUR_SHOT,
      prediction: { ...CALL_YOUR_SHOT.prediction, multiplier: 2 },
    };
    expect(scoreOf(doubled, [3, 5], 3)).toBe(18); // 8 + 2*5
  });

  it("ignores a call under a ruleset without prediction", () => {
    expect(scoreOf(VANILLA, [3, 5], 999)).toBe(8);
  });

  it("ignores a missing call even when prediction is on", () => {
    expect(scoreOf(CALL_YOUR_SHOT, [3, 5])).toBe(8);
    expect(scoreOf(CALL_YOUR_SHOT, [3, 5], null)).toBe(8);
  });
});

describe("scoreOf — modifiers", () => {
  it("doubles only the golden tile", () => {
    const golden: Ruleset = {
      ...VANILLA,
      modifiers: [{ kind: "golden_tile", tile: 5, multiplier: 2 }],
    };
    expect(scoreOf(golden, [3, 5])).toBe(13); // 3 + 5*2
  });

  it("adds a flat penalty when the penalty tile is left standing", () => {
    const penalty: Ruleset = {
      ...VANILLA,
      modifiers: [{ kind: "penalty_tile", tile: 1, add: 5 }],
    };
    expect(scoreOf(penalty, [1, 2])).toBe(8); // (1+5) + 2
    expect(scoreOf(penalty, [2, 3])).toBe(5); // untouched when it is shut
  });
});

describe("maxScoreOf", () => {
  it("is the tile sum for vanilla", () => {
    expect(maxScoreOf(VANILLA)).toBe(78);
  });

  // This is what the score check constraint has to allow, and why it could not
  // stay `between 0 and 78`.
  it("doubles when prediction is on", () => {
    expect(maxScoreOf(CALL_YOUR_SHOT)).toBe(156);
  });

  it("is every tile read as a number under digital scoring", () => {
    expect(maxScoreOf(DIGITAL_9)).toBe(123456789);
  });
});

describe("winSignOf", () => {
  it("sorts ascending when the lowest score wins", () => {
    expect(winSignOf(VANILLA)).toBe(1);
    expect([5, 2, 9].sort((a, b) => (a - b) * winSignOf(VANILLA))).toEqual([2, 5, 9]);
  });

  it("sorts descending when the highest score wins", () => {
    const highest: Ruleset = { ...VANILLA, win: "highest" };
    expect(winSignOf(highest)).toBe(-1);
    expect([5, 2, 9].sort((a, b) => (a - b) * winSignOf(highest))).toEqual([9, 5, 2]);
  });
});

describe("parseRuleset", () => {
  it("returns a well formed ruleset", () => {
    expect(parseRuleset(VANILLA)).toEqual(VANILLA);
  });

  it("refuses anything it cannot score correctly", () => {
    expect(() => parseRuleset(null)).toThrow(/not an object/);
    expect(() => parseRuleset({ ...VANILLA, v: 2 })).toThrow(/version/);
    expect(() => parseRuleset({ ...VANILLA, tiles: 11 })).toThrow(/tiles/);
    expect(() => parseRuleset({ ...VANILLA, win: "sideways" })).toThrow(/win/);
    expect(() => parseRuleset({ ...VANILLA, scoring: { kind: "vibes" } })).toThrow(
      /scoring/,
    );
  });
});

describe("board and labels", () => {
  it("lists the tiles on the board", () => {
    expect(boardTiles(DIGITAL_9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(boardTiles(VANILLA)).toHaveLength(12);
  });

  it("labels the running total per scoring kind", () => {
    expect(scoreLabel(VANILLA)).toBe("Score if you stop now");
    expect(scoreLabel(DIGITAL_9)).toBe("Digital score if you stop now");
  });

  it("reports whether a zero ends the game", () => {
    expect(instantWinOf(VANILLA)).toBe(true);
    expect(instantWinOf({ ...VANILLA, shut_box: { instant_win: false } })).toBe(false);
  });
});

describe("describeRules", () => {
  it("explains why the one-die switch waits for the high tiles", () => {
    const dice = describeRules(VANILLA).find((s) => s.heading === "Dice")!;
    expect(dice.body).toContain("every tile above 6 is shut");
    expect(dice.body).toContain("can never reach them");
  });

  it("describes the scoring the ruleset actually uses", () => {
    expect(
      describeRules(DIGITAL_9).find((s) => s.heading === "Scoring")!.body,
    ).toContain("3 and 5 up is 35");
  });

  it("only mentions calling your shot when prediction is on", () => {
    expect(describeRules(VANILLA).map((s) => s.heading)).not.toContain(
      "Call your shot",
    );
    const called = describeRules(CALL_YOUR_SHOT).find(
      (s) => s.heading === "Call your shot",
    )!;
    expect(called.body).toContain("sealed");
    expect(called.body).toContain("no stopping on your number");
  });

  it("only lists special tiles when there are some", () => {
    expect(describeRules(VANILLA).map((s) => s.heading)).not.toContain(
      "Special tiles",
    );
    const golden: Ruleset = {
      ...VANILLA,
      modifiers: [{ kind: "golden_tile", tile: 7, multiplier: 2 }],
    };
    expect(
      describeRules(golden).find((s) => s.heading === "Special tiles")!.body,
    ).toContain("Tile 7 is golden");
  });

  it("always ends on the house etiquette", () => {
    expect(describeRules(VANILLA).at(-1)!.body).toContain("Fika is not negotiable");
  });

  it("reflects whether a zero ends the game", () => {
    expect(
      describeRules(VANILLA).find((s) => s.heading === "Shut the box")!.body,
    ).toContain("ends on the spot");
  });

  it("is not empty for any shipped ruleset", () => {
    for (const rules of [VANILLA, CALL_YOUR_SHOT, DIGITAL_9]) {
      expect(describeRules(rules).length).toBeGreaterThan(3);
      expect(predictionEnabled(rules)).toBe(rules.prediction.enabled);
    }
  });
});
