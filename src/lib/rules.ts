/**
 * The TypeScript twin of the ruleset functions in
 * supabase/migrations/0004_rulesets_seasons.sql.
 *
 * [concept: twinned scoring] SQL owns the truth — the invariant trigger and the
 * RPCs recompute every score server-side — but the board needs a live "score if
 * you stop now" as tiles flip, which has to happen in the browser. These two
 * implementations must agree, so src/lib/rules.test.ts asserts the same
 * fixtures as supabase/tests/0004_rulesets_seasons.sql.
 */

export type TileCount = 9 | 10 | 12;
export type ScoringKind = "sum_open" | "concat_open";
export type WinDirection = "lowest" | "highest";
export type TiePolicy = "share" | "earliest_turn" | "replay";
export type OneDieRuleKind = "never" | "always_allowed" | "when_all_above_shut";

export type Modifier =
  | { kind: "golden_tile"; tile: number; multiplier: number }
  | { kind: "penalty_tile"; tile: number; add: number };

export type Ruleset = {
  v: 1;
  tiles: TileCount;
  scoring: { kind: ScoringKind };
  win: WinDirection;
  shut_box: { instant_win: boolean };
  dice: {
    count: number;
    one_die_rule: { kind: OneDieRuleKind; threshold?: number };
  };
  modifiers: Modifier[];
  ties: TiePolicy;
  prediction: {
    enabled: boolean;
    sealed: boolean;
    penalty: "abs_offset";
    multiplier: number;
  };
  voluntary_stop: { enabled: boolean };
};

export type RulesetRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  rules: Ruleset;
  is_active: boolean;
};

const TILE_COUNTS: readonly number[] = [9, 10, 12];

/**
 * Narrows a `rules` column into a Ruleset, throwing if it is not one.
 *
 * Deliberately strict rather than forgiving: a half-read ruleset would score
 * games wrongly and quietly. The database enforces the same rules in
 * ruleset_validation_error(), so anything stored is already valid — this
 * guards the boundary where untyped JSON becomes a typed object.
 */
export function parseRuleset(input: unknown): Ruleset {
  const r = input as Ruleset | null;
  if (!r || typeof r !== "object") throw new Error("ruleset: not an object");
  if (r.v !== 1) throw new Error(`ruleset: unsupported version ${r.v}`);
  if (!TILE_COUNTS.includes(r.tiles))
    throw new Error(`ruleset: tiles must be 9, 10 or 12 (got ${r.tiles})`);
  if (r.scoring?.kind !== "sum_open" && r.scoring?.kind !== "concat_open")
    throw new Error("ruleset: unknown scoring kind");
  if (r.win !== "lowest" && r.win !== "highest")
    throw new Error("ruleset: win must be lowest or highest");
  return r;
}

export function tilesOf(rules: Ruleset): TileCount {
  return rules.tiles;
}

/** All tile numbers on the board, 1..n. */
export function boardTiles(rules: Ruleset): number[] {
  return Array.from({ length: rules.tiles }, (_, i) => i + 1);
}

/**
 * +1 when the lowest score wins, -1 when the highest does, so any ranking is
 * `sort((a, b) => (a - b) * winSign)`.
 */
export function winSignOf(rules: Ruleset): 1 | -1 {
  return rules.win === "highest" ? -1 : 1;
}

export function instantWinOf(rules: Ruleset): boolean {
  return rules.shut_box?.instant_win ?? true;
}

export function predictionEnabled(rules: Ruleset): boolean {
  return rules.prediction?.enabled ?? false;
}

export function predictionMultiplier(rules: Ruleset): number {
  return rules.prediction?.multiplier ?? 1;
}

export function voluntaryStopEnabled(rules: Ruleset): boolean {
  return rules.voluntary_stop?.enabled ?? false;
}

function modifierFor(rules: Ruleset, tile: number): Modifier | undefined {
  return (rules.modifiers ?? []).find((m) => m.tile === tile);
}

/**
 * The score for a set of tiles left standing.
 *
 * `predicted` is only consulted by rulesets with prediction enabled, where the
 * miss is added on as an ABSOLUTE offset — a signed offset would let a player
 * call 78, score 8 and finish below zero.
 */
export function scoreOf(
  rules: Ruleset,
  tilesOpen: readonly number[],
  predicted?: number | null,
): number {
  let base: number;

  if (rules.scoring.kind === "concat_open") {
    // "Digital" scoring: the tiles left standing read as one number, so 3 and 5
    // up is 35 rather than 8.
    const digits = [...tilesOpen].sort((a, b) => a - b).join("");
    base = digits === "" ? 0 : Number.parseInt(digits, 10);
  } else {
    base = tilesOpen.reduce((total, tile) => {
      const mod = modifierFor(rules, tile);
      const multiplier = mod && "multiplier" in mod ? mod.multiplier : 1;
      const add = mod && "add" in mod ? mod.add : 0;
      return total + tile * multiplier + add;
    }, 0);
  }

  if (predictionEnabled(rules) && predicted != null) {
    return base + predictionMultiplier(rules) * Math.abs(base - predicted);
  }
  return base;
}

/**
 * The worst possible score. With prediction on the ceiling is
 * (1 + multiplier)x the plain ceiling: call zero, leave every tile standing.
 */
export function maxScoreOf(rules: Ruleset): number {
  const base = scoreOf(rules, boardTiles(rules));
  return predictionEnabled(rules)
    ? base * (1 + predictionMultiplier(rules))
    : base;
}

/** Label for the running total on the board. */
export function scoreLabel(rules: Ruleset): string {
  return rules.scoring.kind === "concat_open"
    ? "Digital score if you stop now"
    : "Score if you stop now";
}

/** Whether a set of open tiles is a shut box under this ruleset. */
export function isShutBox(tilesOpen: readonly number[]): boolean {
  return tilesOpen.length === 0;
}

export type RulesSection = { heading: string; body: string };

/**
 * Plain-English rules for the house-rules page, derived from the ruleset so it
 * can never drift from what the app actually scores.
 */
export function describeRules(rules: Ruleset): RulesSection[] {
  const sections: RulesSection[] = [
    {
      heading: "The box",
      body: `${rules.tiles} tiles, numbered 1 to ${rules.tiles}.`,
    },
    { heading: "Dice", body: describeDice(rules) },
    { heading: "Scoring", body: describeScoring(rules) },
    {
      heading: "Winning",
      body:
        (rules.win === "lowest"
          ? "The lowest score wins the day."
          : "The highest score wins the day.") +
        (rules.ties === "share"
          ? " Ties share it."
          : rules.ties === "earliest_turn"
            ? " A tie goes to whoever played first."
            : " A tie is replayed."),
    },
    {
      heading: "Shut the box",
      body: instantWinOf(rules)
        ? "Score zero and the game ends on the spot — nobody else rolls."
        : "Score zero and you have simply had a very good turn; play continues.",
    },
  ];

  if (rules.modifiers?.length) {
    sections.push({
      heading: "Special tiles",
      body: rules.modifiers
        .map((m) =>
          m.kind === "golden_tile"
            ? `Tile ${m.tile} is golden: it counts ${m.multiplier}x if it is left standing.`
            : `Tile ${m.tile} carries a penalty: it costs an extra ${m.add} if it is left standing.`,
        )
        .join(" "),
    });
  }

  if (predictionEnabled(rules)) {
    const multiplier = predictionMultiplier(rules);
    sections.push({
      heading: "Call your shot",
      body:
        `Before you roll, call the score you think you will end on. However far off you are, ` +
        `that gap is added to your score${multiplier > 1 ? `, ${multiplier} times over` : ""} — ` +
        `whether you go over or under.` +
        (rules.prediction.sealed
          ? " Calls are sealed, so nobody can wait to hear what they need."
          : "") +
        (voluntaryStopEnabled(rules)
          ? ""
          : " You play until the dice strand you; there is no stopping on your number."),
    });
  }

  sections.push({
    heading: "House etiquette",
    body: "The scorekeeper's word is final. Fika is not negotiable.",
  });

  return sections;
}

function describeDice(rules: Ruleset): string {
  const count = rules.dice?.count ?? 2;
  const rule = rules.dice?.one_die_rule;
  const base = count === 1 ? "One die." : `${count} dice.`;

  if (!rule || rule.kind === "never") {
    return `${base} Always roll all of them.`;
  }
  if (rule.kind === "always_allowed") {
    return `${base} You may drop to a single die whenever you like.`;
  }
  // A single die can only ever roll 1-6, so it cannot reach a tile above the
  // threshold at all — which is exactly why the switch waits for them to shut.
  const threshold = rule.threshold ?? 6;
  return (
    `${base} Once every tile above ${threshold} is shut you may switch to one die ` +
    `for the rest of your turn. Not before: a single die can never reach them.`
  );
}

function describeScoring(rules: Ruleset): string {
  if (rules.scoring.kind === "concat_open") {
    return (
      "The tiles left standing read as a number, not a sum — 3 and 5 up is 35. " +
      "The low tiles are the dangerous ones."
    );
  }
  return "Your score is the sum of the tiles left standing. Lower is better.";
}
