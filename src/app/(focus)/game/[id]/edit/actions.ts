"use server";

import { revalidatePath } from "next/cache";
import { requireSession, SessionError } from "@/lib/auth";
import { describeDbError } from "@/lib/db-errors";
import { supabaseAdmin } from "@/lib/supabase";
import type { ActionResult } from "@/app/(focus)/game/actions";

/**
 * Correcting the record.
 *
 * Every one of these needs a named player, not just the PIN: a change to the
 * history has to be attributable, which is the whole reason the identity gate
 * exists. The rules themselves live in SQL (migration 0013) — these actions
 * only shape the input and turn a refusal into something worth reading.
 */

export type ResultInput = {
  playerId: string;
  status: "done" | "dnp";
  score: number | null;
  tilesOpen: number[] | null;
};

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

function toRows(results: ResultInput[]) {
  return results.map((r) => ({
    player_id: r.playerId,
    status: r.status,
    score: r.status === "done" ? r.score : null,
    tiles_open: r.status === "done" ? r.tilesOpen : null,
  }));
}

function touched(gameId: string) {
  // A correction moves ratings and badges, so everything derived is stale.
  revalidatePath("/");
  revalidatePath("/stats");
  revalidatePath(`/game/${gameId}`);
}

export async function editGame(
  gameId: string,
  playedOn: string,
  results: ResultInput[],
  note?: string,
): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("edit_game", {
      p_actor: actorId,
      p_game_id: gameId,
      p_played_on: playedOn,
      p_results: toRows(results),
      p_note: note?.trim() || null,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    touched(gameId);
    return { ok: true };
  });
}

export async function deleteGame(
  gameId: string,
  reason?: string,
): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("delete_game", {
      p_actor: actorId,
      p_game_id: gameId,
      p_reason: reason?.trim() || null,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    touched(gameId);
    return { ok: true };
  });
}

export async function restoreGame(gameId: string): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("restore_game", {
      p_actor: actorId,
      p_game_id: gameId,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    touched(gameId);
    return { ok: true };
  });
}

/**
 * Undoes whatever was last done to this game.
 *
 * The audit id is looked up here rather than passed from the browser: the
 * client would have to re-fetch it after every save just to keep an Undo
 * button honest, and a stale id is exactly what the RPC refuses.
 */
export async function undoLastChange(gameId: string): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("audit_log")
      .select("id")
      .eq("entity", "game")
      .eq("entity_id", gameId)
      .in("action", ["game.edit", "game.delete", "game.restore", "game.undo"])
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    const auditId = (data as { id: number } | null)?.id;
    if (!auditId) return { ok: false, error: "There is nothing to undo." };

    const { error } = await sb.rpc("undo_game_change", {
      p_actor: actorId,
      p_audit_id: auditId,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    touched(gameId);
    return { ok: true };
  });
}

/** Reverses one specific recorded change. */
export async function undoChange(
  gameId: string,
  auditId: number,
): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("undo_game_change", {
      p_actor: actorId,
      p_audit_id: auditId,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    touched(gameId);
    return { ok: true };
  });
}

export async function addManualGame(
  playedOn: string,
  results: ResultInput[],
  note?: string,
): Promise<ActionResult<{ gameId: string }>> {
  return withSession<{ gameId: string }>(async (actorId) => {
    const { data, error } = await supabaseAdmin().rpc("add_manual_game", {
      p_actor: actorId,
      p_played_on: playedOn,
      p_results: toRows(results),
      p_note: note?.trim() || null,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    const gameId = data as string;
    touched(gameId);
    return { ok: true, gameId };
  });
}
