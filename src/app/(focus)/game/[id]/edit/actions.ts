"use server";

import { revalidatePath } from "next/cache";
import { requireSession, SessionError } from "@/lib/auth";
import { describeDbError } from "@/lib/db-errors";
import { checkUpload, photoObjectPath } from "@/lib/storage-paths";
import { supabaseAdmin } from "@/lib/supabase";
import { rpc } from "@/lib/db-rows";
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
    const { error } = await rpc(supabaseAdmin(), "edit_game", {
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
    const { error } = await rpc(supabaseAdmin(), "delete_game", {
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
    const { data, error } = await rpc(supabaseAdmin(), "add_manual_game", {
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

// ---------------------------------------------------------------------------
// The photo of the day
// ---------------------------------------------------------------------------

/**
 * Pins a photo to a game. The browser has already resized it to about a
 * megabyte; `checkUpload` is the backstop. Uploads to Storage first and only
 * then records the path, so a failed upload leaves the row untouched.
 */
export async function uploadGamePhoto(
  gameId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const file = formData.get("photo");
    if (!(file instanceof File)) {
      return { ok: false, error: "No photo was attached." };
    }
    const problem = checkUpload("photo", file);
    if (problem) return { ok: false, error: problem };

    const sb = supabaseAdmin();
    const { data, error: gameError } = await sb
      .from("games")
      .select("played_on, photo_path")
      .eq("id", gameId)
      .is("deleted_at", null)
      .maybeSingle();
    if (gameError) return { ok: false, error: gameError.message };
    const game = data as { played_on: string; photo_path: string | null } | null;
    if (!game) return { ok: false, error: "That game is not around any more." };

    const path = photoObjectPath(game.played_on, gameId, file.type);
    const { error: uploadError } = await sb.storage
      .from("game-photos")
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    // A re-take in a different format would otherwise leave the old object
    // behind in the bucket, orphaned.
    if (game.photo_path && game.photo_path !== path) {
      await sb.storage.from("game-photos").remove([game.photo_path]);
    }

    const { error } = await rpc(sb, "set_game_photo", {
      p_actor: actorId,
      p_game_id: gameId,
      p_path: path,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    touched(gameId);
    return { ok: true };
  });
}

/** Takes the photo down. The row is cleared first, then the object — a row
 *  pointing at a missing object is the worse of the two failure states. */
export async function clearGamePhoto(gameId: string): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("games")
      .select("photo_path")
      .eq("id", gameId)
      .maybeSingle();
    const path = (data as { photo_path: string | null } | null)?.photo_path;
    if (!path) return { ok: true };

    const { error } = await rpc(sb, "set_game_photo", {
      p_actor: actorId,
      p_game_id: gameId,
      p_path: null,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    await sb.storage.from("game-photos").remove([path]);
    touched(gameId);
    return { ok: true };
  });
}
