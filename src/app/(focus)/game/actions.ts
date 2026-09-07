"use server";

import { revalidatePath } from "next/cache";
import { hasPin, requireSession, SessionError } from "@/lib/auth";
import { describeDbError } from "@/lib/db-errors";
import { parseSnapshot, type LiveSnapshot } from "@/lib/live";
import { supabaseAdmin } from "@/lib/supabase";
import { announceWinners } from "@/lib/teams";

/**
 * The only way a game is written.
 *
 * v1 built the whole game in one phone's React state and posted it at the end
 * with two inserts and a best-effort rollback. Each action here is a single
 * RPC, so the game exists in the database from the moment it starts: a refresh
 * resumes it, and (from WP-B7) another phone can watch it.
 *
 * [concept: server functions are their own entry point] Every action starts
 * with requireSession() — a Server Function is a POST to the route it is used
 * on and is reachable without going through any UI, so the Proxy gate in front
 * of the app is not enough by itself.
 */

export type ActionError = { ok: false; error: string };
/** `object` by default, so an action with nothing to return is just `{ ok: true }`. */
export type ActionResult<T = object> = ({ ok: true } & T) | ActionError;

async function withSession<T = object>(
  run: (actorId: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const { player } = await requireSession();
    return await run(player.id);
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * For reads, which need the PIN but not a name.
 *
 * Watching a game deliberately does not require saying who you are — the game
 * page renders for anyone past the PIN gate. Gating the read on an identity as
 * well made the polling fallback fail silently on exactly those devices: the
 * poll fired every few seconds, the action refused every time, and the board
 * sat frozen while the indicator claimed it was catching up.
 */
async function withPin<T = object>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  if (!(await hasPin())) {
    return { ok: false, error: "Enter the team PIN first." };
  }
  return run();
}

type SnapshotResult = ActionResult<{ snapshot: LiveSnapshot }>;

/** Calls an RPC that returns a snapshot, and maps a database refusal to copy. */
async function rpcSnapshot(
  fn: string,
  args: Record<string, unknown>,
): Promise<SnapshotResult> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) return { ok: false, error: describeDbError(error) };
  return { ok: true, snapshot: parseSnapshot(data) };
}

export async function startGame(
  playerIds: string[],
): Promise<ActionResult<{ gameId: string }>> {
  return withSession<{ gameId: string }>(async (actorId) => {
    const { data, error } = await supabaseAdmin().rpc("start_game", {
      p_actor: actorId,
      p_player_ids: playerIds,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    const snapshot = parseSnapshot(data);
    // Today's page shows a live game, so it needs to know one exists.
    revalidatePath("/");
    return { ok: true, gameId: snapshot.game.id };
  });
}

/**
 * The whole set of tiles currently down, not a single toggle. Sending the
 * desired state makes the call idempotent, so a retry or two taps racing each
 * other cannot leave the board in a state nobody chose.
 */
export async function setBoard(
  gameId: string,
  tilesDown: number[],
): Promise<SnapshotResult> {
  return withSession((actorId) =>
    rpcSnapshot("live_set_board", {
      p_actor: actorId,
      p_game_id: gameId,
      p_tiles_down: tilesDown,
    }),
  );
}

/** Ends the current turn. Omit the score to have it read off the board. */
export async function endTurn(
  gameId: string,
  typedScore?: number | null,
): Promise<SnapshotResult> {
  return withSession((actorId) =>
    rpcSnapshot("end_turn", {
      p_actor: actorId,
      p_game_id: gameId,
      p_typed_score: typedScore ?? null,
    }),
  );
}

/** Fixes a turn from the review screen, before the game is crowned. */
export async function correctTurn(
  gameId: string,
  playerId: string,
  tilesOpen: number[] | null,
  score: number,
): Promise<SnapshotResult> {
  return withSession((actorId) =>
    rpcSnapshot("set_turn_result", {
      p_actor: actorId,
      p_game_id: gameId,
      p_player_id: playerId,
      p_tiles_open: tilesOpen,
      p_score: score,
    }),
  );
}

export async function claimScorekeeper(gameId: string): Promise<SnapshotResult> {
  return withSession((actorId) =>
    rpcSnapshot("claim_scorekeeper", { p_actor: actorId, p_game_id: gameId }),
  );
}

export async function abandonGame(
  gameId: string,
  note?: string,
): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("abandon_game", {
      p_actor: actorId,
      p_game_id: gameId,
      p_note: note ?? null,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    revalidatePath("/");
    return { ok: true };
  });
}

export async function finishGame(
  gameId: string,
): Promise<ActionResult<{ gameId: string }>> {
  return withSession<{ gameId: string }>(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("finish_game", {
      p_actor: actorId,
      p_game_id: gameId,
    });
    if (error) return { ok: false, error: describeDbError(error) };

    // A webhook failure must never fail the save, so this is best effort and
    // reads the winner back out of game_results rather than recomputing it.
    try {
      await announceWinners(gameId);
    } catch (e) {
      console.error("Teams announcement failed (game saved fine):", e);
    }

    revalidatePath("/");
    revalidatePath("/stats");
    return { ok: true, gameId };
  });
}

/**
 * Re-reads the board. Used to close the gap between the server render and a
 * Realtime subscription (WP-B7), and as the polling fallback when the channel
 * cannot connect.
 */
export async function fetchLiveSnapshot(
  gameId: string,
): Promise<SnapshotResult> {
  return withPin(() =>
    rpcSnapshot("live_game_snapshot", { p_game_id: gameId }),
  );
}
