import { parseRuleset, type Ruleset } from "@/lib/rules";

/**
 * The live game snapshot returned by live_game_snapshot() and, from WP-B7, sent
 * to spectators as a Realtime broadcast.
 *
 * [concept: one shape for every reader] The server render, the reconnect fetch
 * and the broadcast all carry this same value, so the scorekeeper and a
 * spectator can never disagree about what the board looks like — and the client
 * never has to merge partial updates.
 */

export type GameStatus = "in_progress" | "finished" | "abandoned";
export type PlayerStatus = "pending" | "playing" | "done" | "dnp";

export type LivePlayer = {
  player_id: string;
  name: string;
  emoji: string;
  turn_order: number;
  status: PlayerStatus;
  score: number | null;
  tiles_open: number[] | null;
  predicted_score: number | null;
};

export type LiveTurn = {
  player_id: string;
  tiles_down: number[];
  tiles_open: number[];
  score_if_stop: number;
  is_shut: boolean;
};

export type LiveSnapshot = {
  game: {
    id: string;
    status: GameStatus;
    played_on: string;
    ruleset_id: string;
    rules: Ruleset;
    scorekeeper_player_id: string | null;
    started_at: string;
    updated_at: string;
    deleted: boolean;
  };
  players: LivePlayer[];
  turn: LiveTurn | null;
  leader_ids: string[];
  all_done: boolean;
  version: number;
};

/** Narrows the RPC's jsonb into a typed snapshot, throwing if it is not one. */
export function parseSnapshot(input: unknown): LiveSnapshot {
  const raw = input as LiveSnapshot | null;
  if (!raw || typeof raw !== "object" || !raw.game?.id) {
    throw new Error("live snapshot: unexpected shape");
  }
  return {
    ...raw,
    game: { ...raw.game, rules: parseRuleset(raw.game.rules) },
    players: raw.players ?? [],
    leader_ids: raw.leader_ids ?? [],
  };
}

/** The player whose turn it is, if anyone's. */
export function currentPlayer(snapshot: LiveSnapshot): LivePlayer | null {
  const id = snapshot.turn?.player_id;
  return snapshot.players.find((p) => p.player_id === id) ?? null;
}

/** Turns played and turns to play, for "Turn 2 of 4". */
export function turnProgress(snapshot: LiveSnapshot): {
  index: number;
  total: number;
} {
  const played = snapshot.players.filter((p) => p.status === "done").length;
  const total = snapshot.players.filter((p) => p.status !== "dnp").length;
  return { index: Math.min(played + 1, total), total };
}

/** Results so far, best first, using the ruleset's own direction. */
export function standings(snapshot: LiveSnapshot): LivePlayer[] {
  const sign = snapshot.game.rules.win === "highest" ? -1 : 1;
  return snapshot.players
    .filter((p) => p.status === "done")
    .sort((a, b) => ((a.score ?? 0) - (b.score ?? 0)) * sign);
}

export function skippedPlayers(snapshot: LiveSnapshot): LivePlayer[] {
  return snapshot.players.filter((p) => p.status === "dnp");
}

/**
 * A game left open for hours is almost always one whose scorekeeper went home,
 * rather than one still being played.
 */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export function isStale(snapshot: LiveSnapshot, now = Date.now()): boolean {
  if (snapshot.game.status !== "in_progress") return false;
  return now - new Date(snapshot.game.updated_at).getTime() > STALE_AFTER_MS;
}
