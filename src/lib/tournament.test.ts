import { describe, expect, it } from "vitest";
import {
  allTeamsDone,
  createdTeamId,
  didNotFinish,
  formatAverage,
  liveMember,
  parseTournamentSnapshot,
  rankedTeams,
  teamById,
  teamProgress,
  winnerTitle,
  winningTeams,
  type TournamentSnapshot,
  type TournamentTeam,
} from "./tournament";

const RULES = {
  v: 1,
  tiles: 12,
  scoring: { kind: "sum_open" },
  win: "lowest",
  shut_box: { instant_win: true },
  dice: { count: 2, one_die_rule: { kind: "when_all_above_shut", threshold: 6 } },
  modifiers: [],
  ties: "share",
  prediction: {
    enabled: false,
    sealed: true,
    penalty: "abs_offset",
    multiplier: 1,
  },
  voluntary_stop: { enabled: false },
};

function team(over: Partial<TournamentTeam> = {}): TournamentTeam {
  return {
    id: "team-1",
    name: "Foxes",
    emoji: "🦊",
    song_url: null,
    seq: 1,
    status: "done",
    members: [],
    member_count: 0,
    played_count: 0,
    sum: null,
    average: null,
    live: null,
    rank: null,
    ...over,
  };
}

function snapshot(teams: TournamentTeam[], over: object = {}): TournamentSnapshot {
  return parseTournamentSnapshot({
    tournament: {
      id: "t-1",
      code: "FKA429",
      name: "Team day",
      status: "open",
      version: 7,
      ruleset_id: "r-1",
      rules: RULES,
      created_at: "2026-09-16T08:00:00Z",
      updated_at: "2026-09-16T08:30:00Z",
      finished_at: null,
      ...over,
    },
    teams,
    leader_team_ids: teams.filter((t) => t.rank === 1).map((t) => t.id),
    counts: {
      teams: teams.length,
      forming: teams.filter((t) => t.status === "forming").length,
      playing: teams.filter((t) => t.status === "playing").length,
      done: teams.filter((t) => t.status === "done").length,
      ranked: teams.filter((t) => t.rank !== null).length,
    },
  });
}

describe("parseTournamentSnapshot", () => {
  it("parses the ruleset, so the board can be drawn from it", () => {
    const parsed = snapshot([]);
    expect(parsed.tournament.rules.tiles).toBe(12);
    expect(parsed.tournament.code).toBe("FKA429");
  });

  it("refuses a value that is not a snapshot", () => {
    expect(() => parseTournamentSnapshot(null)).toThrow(/unexpected shape/);
    expect(() => parseTournamentSnapshot({ teams: [] })).toThrow(/unexpected shape/);
  });

  it("survives a team with no members yet", () => {
    const parsed = parseTournamentSnapshot({
      ...snapshot([]),
      teams: [{ ...team(), members: undefined }],
    });
    expect(parsed.teams[0]!.members).toEqual([]);
  });

  it("ignores the created_team_id the create RPC merges in", () => {
    const raw = { ...snapshot([]), created_team_id: "team-9" };
    expect(() => parseTournamentSnapshot(raw)).not.toThrow();
    expect(createdTeamId(raw)).toBe("team-9");
    expect(createdTeamId(snapshot([]))).toBeNull();
  });
});

describe("ranking", () => {
  const foxes = team({ id: "a", name: "Foxes", seq: 1, rank: 2, average: 56 });
  const owls = team({ id: "b", name: "Owls", seq: 2, rank: 1, average: 20 });
  const ghosts = team({ id: "c", name: "Ghosts", seq: 3, rank: null, status: "forming" });

  it("puts the best average first, whatever order the teams were created in", () => {
    expect(rankedTeams(snapshot([foxes, owls, ghosts])).map((t) => t.name)).toEqual([
      "Owls",
      "Foxes",
    ]);
  });

  it("leaves a team that never rolled out of the ranking entirely", () => {
    expect(didNotFinish(snapshot([foxes, owls, ghosts])).map((t) => t.name)).toEqual([
      "Ghosts",
    ]);
  });

  it("keeps tied teams in creation order rather than inventing a winner", () => {
    const tiedA = team({ id: "a", name: "Foxes", seq: 1, rank: 1, average: 30 });
    const tiedB = team({ id: "b", name: "Owls", seq: 2, rank: 1, average: 30 });
    const shared = snapshot([tiedB, tiedA]);
    expect(rankedTeams(shared).map((t) => t.name)).toEqual(["Foxes", "Owls"]);
    expect(winningTeams(shared).map((t) => t.name)).toEqual(["Foxes", "Owls"]);
  });
});

describe("winnerTitle", () => {
  it("names one winner", () => {
    expect(winnerTitle(["Foxes"])).toBe("Foxes win!");
  });

  it("joins two with an ampersand", () => {
    expect(winnerTitle(["Foxes", "Owls"])).toBe("Foxes & Owls share it!");
  });

  it("gives three or more commas, so it does not read like a law firm", () => {
    expect(winnerTitle(["Foxes", "Owls", "Bears"])).toBe(
      "Foxes, Owls & Bears share it!",
    );
  });

  it("says something sensible when nobody played", () => {
    expect(winnerTitle([])).toBe("Nobody played");
  });
});

describe("formatAverage", () => {
  it("keeps one decimal where it means something", () => {
    expect(formatAverage(56.5)).toBe("56.5");
  });

  it("but does not dress a whole number up as a precise one", () => {
    expect(formatAverage(24)).toBe("24");
  });

  it("has something to show before anybody has played", () => {
    expect(formatAverage(null)).toBe("—");
  });
});

describe("the team's own board", () => {
  const playing = team({
    id: "a",
    status: "playing",
    member_count: 3,
    played_count: 1,
    members: [
      { id: "m1", name: "Anna", turn_order: 1, score: 30, tiles_open: [], played_at: "x" },
      { id: "m2", name: "Bo", turn_order: 2, score: null, tiles_open: null, played_at: null },
      { id: "m3", name: "Cy", turn_order: 3, score: null, tiles_open: null, played_at: null },
    ],
    live: {
      member_id: "m2",
      tiles_down: [1, 2],
      tiles_open: [3, 4],
      score_if_stop: 7,
      is_shut: false,
    },
  });

  it("knows who is at the board", () => {
    expect(liveMember(playing)?.name).toBe("Bo");
    expect(liveMember(team())).toBeNull();
  });

  it("counts the turn people are on", () => {
    expect(teamProgress(playing)).toEqual({ index: 2, total: 3 });
  });

  it("does not run past the end when everyone has played", () => {
    const done = team({ member_count: 2, played_count: 2 });
    expect(teamProgress(done)).toEqual({ index: 2, total: 2 });
  });

  it("finds a team by id", () => {
    expect(teamById(snapshot([playing]), "a")?.id).toBe("a");
    expect(teamById(snapshot([playing]), "nope")).toBeNull();
  });
});

describe("allTeamsDone", () => {
  it("is false while anyone is still playing", () => {
    expect(
      allTeamsDone(snapshot([team({ id: "a", status: "done" }), team({ id: "b", status: "playing" })])),
    ).toBe(false);
  });

  it("is true once every team has finished", () => {
    expect(
      allTeamsDone(snapshot([team({ id: "a", status: "done" }), team({ id: "b", status: "done" })])),
    ).toBe(true);
  });

  it("is false for an event with no teams at all", () => {
    expect(allTeamsDone(snapshot([]))).toBe(false);
  });
});
