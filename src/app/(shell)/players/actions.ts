"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { extractVideoId } from "@/lib/youtube";

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
  const { error } = await supabaseAdmin()
    .from("players")
    .update({ is_active: active })
    .eq("id", playerId);
  if (error) throw new Error(error.message);
  revalidatePath("/players");
}
