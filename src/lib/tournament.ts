import { parseRuleset, type Ruleset } from "@/lib/rules";

/**
 * The snapshot returned by tournament_snapshot() (migration 0021), and sent to
 * every device as a Realtime broadcast on `tournament:<id>`.
 *
 * [concept: one shape for every reader] The lobby on the projector, a team's
 * board on a phone and the result page all render from this same value, so they
 * cannot disagree — and nothing ever has to merge a partial update.
 *
 * The mirror of this shape lives in SQL. Anything added here must be added to
 * tournament_snapshot() as well, or it will be undefined in the broadcast and
 * merely present on the first server render, which is the worst of both.
 */

export type TournamentStatus = "open" | "finished";
export type TeamStatus = "forming" | "playing" | "done";

export type TournamentMember = {
  id: string;
  name: string;
  turn_order: number;
  score: number | null;
  /** Null when the score was typed in, so there is no board to show. */
  tiles_open: number[] | null;
  played_at: string | null;
};

export type TournamentLive = {
  member_id: string;
  tiles_down: number[];
  tiles_open: number[];
  score_if_stop: number;
  is_shut: boolean;
};

export type TournamentTeam = {
  id: string;
  name: string;
  emoji: string;
  song_url: string | null;
  seq: number;
  status: TeamStatus;
  members: TournamentMember[];
  member_count: number;
  played_count: number;
  /** Over the members who have played; null until somebody has. */
  sum: number | null;
  average: number | null;
  live: TournamentLive | null;
  /** Null for a team that never rolled — unranked, not last. */
  rank: number | null;
};

export type TournamentSnapshot = {
  tournament: {
    id: string;
    code: string;
    name: string;
    status: TournamentStatus;
    version: number;
    ruleset_id: string;
    rules: Ruleset;
    created_at: string;
    updated_at: string;
    finished_at: string | null;
  };
  teams: TournamentTeam[];
  /** The teams on rank 1. More than one means a shared win, and both anthems. */
  leader_team_ids: string[];
  counts: {
    teams: number;
    forming: number;
    playing: number;
    done: number;
    ranked: number;
  };
};

/** Narrows the RPC's jsonb into a typed snapshot, throwing if it is not one. */
export function parseTournamentSnapshot(input: unknown): TournamentSnapshot {
  const raw = input as TournamentSnapshot | null;
  if (!raw || typeof raw !== "object" || !raw.tournament?.id) {
    throw new Error("tournament snapshot: unexpected shape");
  }
  return {
    ...raw,
    tournament: {
      ...raw.tournament,
      rules: parseRuleset(raw.tournament.rules),
    },
    teams: (raw.teams ?? []).map((team) => ({
      ...team,
      members: team.members ?? [],
    })),
    leader_team_ids: raw.leader_team_ids ?? [],
  };
}

/**
 * tournament_create_team returns the snapshot with the new team's id merged in,
 * so the phone that created it can go straight to its board.
 */
export function createdTeamId(input: unknown): string | null {
  const id = (input as { created_team_id?: unknown } | null)?.created_team_id;
  return typeof id === "string" ? id : null;
}

export function teamById(
  snapshot: TournamentSnapshot,
  teamId: string,
): TournamentTeam | null {
  return snapshot.teams.find((t) => t.id === teamId) ?? null;
}

/** Whoever is at the board for this team, if anyone is. */
export function liveMember(team: TournamentTeam): TournamentMember | null {
  const id = team.live?.member_id;
  return team.members.find((m) => m.id === id) ?? null;
}

/** "Turn 2 of 3" for the team's own board. */
export function teamProgress(team: TournamentTeam): {
  index: number;
  total: number;
} {
  return {
    index: Math.min(team.played_count + 1, Math.max(team.member_count, 1)),
    total: team.member_count,
  };
}

/**
 * Teams that scored, best first. Ties keep the same rank and fall back to the
 * order they were created in, so a shared lead is not silently broken by
 * whoever happened to be entered first.
 */
export function rankedTeams(snapshot: TournamentSnapshot): TournamentTeam[] {
  return snapshot.teams
    .filter((t) => t.rank !== null)
    .sort((a, b) => a.rank! - b.rank! || a.seq - b.seq);
}

/** Teams nobody played a single turn for. Listed, never ranked. */
export function didNotFinish(snapshot: TournamentSnapshot): TournamentTeam[] {
  return snapshot.teams
    .filter((t) => t.rank === null)
    .sort((a, b) => a.seq - b.seq);
}

export function winningTeams(snapshot: TournamentSnapshot): TournamentTeam[] {
  const ids = new Set(snapshot.leader_team_ids);
  return snapshot.teams.filter((t) => ids.has(t.id)).sort((a, b) => a.seq - b.seq);
}

/**
 * The headline. Three or more names take commas — "A & B & C" reads like a law
 * firm, which is the same reason the daily game's celebration does this.
 */
export function winnerTitle(names: string[]): string {
  if (names.length === 0) return "Nobody played";
  if (names.length === 1) return `${names[0]} win!`;
  const shared =
    names.length > 2
      ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`
      : names.join(" & ");
  return `${shared} share it!`;
}

/**
 * One decimal, and no trailing ".0" on a whole number — an average of exactly
 * 24 should not read as more precise than it is.
 */
export function formatAverage(average: number | null): string {
  if (average === null) return "—";
  return Number.isInteger(average) ? String(average) : average.toFixed(1);
}

/** Whether every team that has members has finished; the Finish button's copy. */
export function allTeamsDone(snapshot: TournamentSnapshot): boolean {
  return (
    snapshot.counts.teams > 0 && snapshot.counts.done === snapshot.counts.teams
  );
}
