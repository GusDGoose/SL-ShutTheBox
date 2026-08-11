"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
import { postWinnerCard, type AnnouncedWinner } from "@/lib/teams";
import type { Player, PlayerStreakRow } from "@/lib/types";

// The ONLY code path that writes games. Client state (the whole in-progress
// game) arrives here once, on "Finish & crown".
export type SaveGameEntry = {
  playerId: string;
  score: number;
  tilesOpen: number[] | null; // null = manual score entry
};
export type SaveGamePayload = { maxTile: 9 | 12; entries: SaveGameEntry[] };
export type SaveGameResult = { gameId: string } | { error: string };

const MAX_SCORE: Record<number, number> = { 9: 45, 12: 78 };

function validate(payload: SaveGamePayload): string | null {
  const { maxTile, entries } = payload;
  if (maxTile !== 9 && maxTile !== 12) return "Invalid tile count.";
  if (!Array.isArray(entries) || entries.length === 0)
    return "At least one player must have played.";
  const ids = new Set(entries.map((e) => e.playerId));
  if (ids.size !== entries.length) return "A player appears twice.";

  for (const e of entries) {
    if (!Number.isInteger(e.score) || e.score < 0 || e.score > MAX_SCORE[maxTile])
      return `A score must be a whole number between 0 and ${MAX_SCORE[maxTile]}.`;
    if (e.tilesOpen !== null) {
      const valid =
        Array.isArray(e.tilesOpen) &&
        e.tilesOpen.every(
          (t) => Number.isInteger(t) && t >= 1 && t <= maxTile,
        ) &&
        new Set(e.tilesOpen).size === e.tilesOpen.length;
      if (!valid) return "Board state is invalid.";
      const sum = e.tilesOpen.reduce((a, b) => a + b, 0);
      if (sum !== e.score)
        return "Board state doesn't match the score — this is a bug, yell at Claude.";
    }
  }
  return null;
}

export async function saveGame(payload: SaveGamePayload): Promise<SaveGameResult> {
  const invalid = validate(payload);
  if (invalid) return { error: invalid };

  const sb = supabaseAdmin();

  const { data: game, error: gameError } = await sb
    .from("games")
    .insert({ max_tile: payload.maxTile }) // played_on = DB default (Stockholm today)
    .select("id")
    .single();
  if (gameError || !game) return { error: gameError?.message ?? "Could not create game." };

  const rows = payload.entries.map((e, i) => ({
    game_id: game.id,
    player_id: e.playerId,
    score: e.score,
    tiles_open: e.tilesOpen,
    turn_order: i + 1,
  }));
  const { error: rowsError } = await sb.from("game_players").insert(rows);

  if (rowsError) {
    // [concept: compensating action] supabase-js can't wrap two inserts in one
    // transaction, so on failure we delete the parent row (cascade cleans up
    // any partial children). A plpgsql save_game() RPC is the v2 way.
    await sb.from("games").delete().eq("id", game.id);
    return { error: rowsError.message };
  }

  // Announce in Teams — a webhook failure must NEVER fail the save.
  try {
    await announceWinners(sb, payload);
  } catch (e) {
    console.error("Teams announcement failed (game saved fine):", e);
  }

  return { gameId: game.id };
}

async function announceWinners(sb: SupabaseClient, payload: SaveGamePayload) {
  if (!process.env.TEAMS_WEBHOOK_URL) return;

  const minScore = Math.min(...payload.entries.map((e) => e.score));
  const winnerIds = payload.entries
    .filter((e) => e.score === minScore)
    .map((e) => e.playerId);

  const [playersRes, streaksRes] = await Promise.all([
    sb.from("players").select("*").in("id", winnerIds),
    sb.from("player_streaks").select("*").in("player_id", winnerIds),
  ]);
  const players = (playersRes.data ?? []) as Player[];
  const streaks = new Map(
    ((streaksRes.data ?? []) as PlayerStreakRow[]).map((s) => [s.player_id, s]),
  );

  const winners: AnnouncedWinner[] = players.map((p) => ({
    name: p.name,
    emoji: p.emoji,
    score: minScore,
    streak: streaks.get(p.id)?.current_streak ?? 0,
    shutBox: minScore === 0,
  }));
  await postWinnerCard(winners);
}
