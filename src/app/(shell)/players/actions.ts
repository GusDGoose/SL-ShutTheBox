"use server";

import { revalidatePath } from "next/cache";
import { hasPin, requireSession, SessionError } from "@/lib/auth";
import { checkUpload, clipObjectPath } from "@/lib/storage-paths";
import { supabaseAdmin } from "@/lib/supabase";
import { extractVideoId } from "@/lib/youtube";
import type { ActionResult } from "@/app/(focus)/game/actions";

// [concept: useActionState contract] These actions take (previousState,
// formData) and return the new state — React 19's form-state pattern. The
// client form shows `error` inline without any client-side fetch code.
export type PlayerFormState = { error?: string; ok?: boolean };

function readForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim() || "🎲";
  const songUrl = String(formData.get("song_url") ?? "").trim();
  return { name, emoji, songUrl };
}

function validate({ name, songUrl }: { name: string; songUrl: string }) {
  if (!name) return "Name is required.";
  if (songUrl && !extractVideoId(songUrl)) {
    return "That doesn't look like a YouTube video link — paste a watch?v=, youtu.be, or shorts URL.";
  }
  return null;
}

export async function createPlayer(
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  // The proxy gates the page, but an action is a POST endpoint of its own and
  // render-time gating is not a security boundary. PIN only, on purpose: a
  // new colleague adds themselves before they have an identity to pick.
  if (!(await hasPin())) return { error: "Enter the team PIN first." };
  const fields = readForm(formData);
  const invalid = validate(fields);
  if (invalid) return { error: invalid };

  const { error } = await supabaseAdmin().from("players").insert({
    name: fields.name,
    emoji: fields.emoji,
    song_url: fields.songUrl || null,
  });
  if (error) {
    // 23505 = Postgres unique_violation (players.name is unique)
    return {
      error:
        error.code === "23505"
          ? `"${fields.name}" is already on the roster.`
          : error.message,
    };
  }
  revalidatePath("/players");
  return { ok: true };
}

export async function updatePlayer(
  playerId: string,
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  if (!(await hasPin())) return { error: "Enter the team PIN first." };
  const fields = readForm(formData);
  const invalid = validate(fields);
  if (invalid) return { error: invalid };

  const { error } = await supabaseAdmin()
    .from("players")
    .update({
      name: fields.name,
      emoji: fields.emoji,
      song_url: fields.songUrl || null,
    })
    .eq("id", playerId);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? `"${fields.name}" is already on the roster.`
          : error.message,
    };
  }
  revalidatePath("/players");
  return { ok: true };
}

export async function togglePlayerActive(playerId: string, active: boolean) {
  if (!(await hasPin())) throw new Error("Enter the team PIN first.");
  const { error } = await supabaseAdmin()
    .from("players")
    .update({ is_active: active })
    .eq("id", playerId);
  if (error) throw new Error(error.message);
  revalidatePath("/players");
}

// ---------------------------------------------------------------------------
// Song clips
//
// Which slice of a player's song plays, and optionally their own MP3 instead
// of a YouTube embed. These need a named player rather than just the PIN: they
// write to Storage and go in the audit trail.
// ---------------------------------------------------------------------------

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

export type ClipSettings = {
  startSeconds: number;
  /** Null means "to the end" at the crowning, and start + 10 s for a walk-up. */
  endSeconds: number | null;
  fadeMs: number;
  loop: boolean;
};

function validateClip(c: ClipSettings): string | null {
  if (!Number.isInteger(c.startSeconds) || c.startSeconds < 0) {
    return "The start has to be a whole number of seconds, from 0.";
  }
  if (
    c.endSeconds !== null &&
    (!Number.isInteger(c.endSeconds) || c.endSeconds <= c.startSeconds)
  ) {
    return "The end has to come after the start.";
  }
  if (!Number.isInteger(c.fadeMs) || c.fadeMs < 0 || c.fadeMs > 10_000) {
    return "The fade is in milliseconds, between 0 and 10000.";
  }
  return null;
}

type SongColumns = {
  song_url: string | null;
  song_start_seconds: number;
  song_end_seconds: number | null;
  song_fade_ms: number;
  song_loop: boolean;
  song_clip_path: string | null;
};

async function songOf(playerId: string): Promise<SongColumns | null> {
  const { data } = await supabaseAdmin()
    .from("players")
    .select(
      "song_url, song_start_seconds, song_end_seconds, song_fade_ms, song_loop, song_clip_path",
    )
    .eq("id", playerId)
    .maybeSingle();
  return data as SongColumns | null;
}

// Player changes were never audited in v1. Song clips are the first player
// field with a real blast radius (it is what plays at the crowning), so they
// start the player.* trail the plan calls for.
async function auditSong(
  actorId: string,
  playerId: string,
  before: SongColumns | null,
  note: string,
) {
  const after = await songOf(playerId);
  await supabaseAdmin().from("audit_log").insert({
    actor_player_id: actorId,
    action: "player.song",
    entity: "player",
    entity_id: playerId,
    before,
    after,
    note,
  });
}

/** Start/end/fade/repeat — the clip that plays, whatever its source. */
export async function setSongClip(
  playerId: string,
  settings: ClipSettings,
): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const invalid = validateClip(settings);
    if (invalid) return { ok: false, error: invalid };

    const before = await songOf(playerId);
    if (!before) return { ok: false, error: "That player is not on the roster." };

    const { error } = await supabaseAdmin()
      .from("players")
      .update({
        song_start_seconds: settings.startSeconds,
        song_end_seconds: settings.endSeconds,
        song_fade_ms: settings.fadeMs,
        song_loop: settings.loop,
      })
      .eq("id", playerId);
    if (error) return { ok: false, error: error.message };

    await auditSong(actorId, playerId, before, "clip settings changed");
    revalidatePath("/players");
    return { ok: true };
  });
}

/**
 * A player's own MP3 (or M4A/OGG). Wins over the YouTube URL when set: the
 * Web Audio player can trim and fade it exactly, and it works on iPhones,
 * where the IFrame API cannot fade at all.
 */
export async function uploadSongClip(
  playerId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const file = formData.get("clip");
    if (!(file instanceof File)) return { ok: false, error: "No clip was attached." };
    const problem = checkUpload("clip", file);
    if (problem) return { ok: false, error: problem };

    const before = await songOf(playerId);
    if (!before) return { ok: false, error: "That player is not on the roster." };

    const sb = supabaseAdmin();
    const path = clipObjectPath(playerId, file.type);
    const { error: uploadError } = await sb.storage
      .from("song-clips")
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    // A new upload in a different format would otherwise leave the old
    // object orphaned in the bucket.
    if (before.song_clip_path && before.song_clip_path !== path) {
      await sb.storage.from("song-clips").remove([before.song_clip_path]);
    }

    const { error } = await sb
      .from("players")
      .update({ song_clip_path: path })
      .eq("id", playerId);
    if (error) return { ok: false, error: error.message };

    await auditSong(actorId, playerId, before, "clip uploaded");
    revalidatePath("/players");
    return { ok: true };
  });
}

/** Back to the YouTube URL. Row first, then the object, as with photos. */
export async function clearSongClip(playerId: string): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const before = await songOf(playerId);
    const path = before?.song_clip_path;
    if (!before || !path) return { ok: true };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from("players")
      .update({ song_clip_path: null })
      .eq("id", playerId);
    if (error) return { ok: false, error: error.message };
    await sb.storage.from("song-clips").remove([path]);

    await auditSong(actorId, playerId, before, "clip removed");
    revalidatePath("/players");
    return { ok: true };
  });
}
