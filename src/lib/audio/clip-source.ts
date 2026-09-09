import type { Clip } from "@/lib/audio/youtube-api";
import type { Player } from "@/lib/types";
import { extractVideoId } from "@/lib/youtube";

/** How much of a song a walk-up gets when no shorter end is set. */
export const WALK_UP_SECONDS = 10;

/** The slice and shape of a clip, whatever plays it. */
export type ClipTrim = {
  startSeconds: number;
  /** Null plays to the end. */
  endSeconds: number | null;
  fadeMs: number;
  loop: boolean;
};

/**
 * Where a player's song comes from. A YouTube clip is played by the IFrame
 * API in a small embed; a file clip is the player's own upload, fetched
 * through /api/clip and played with Web Audio, which can trim and fade it
 * exactly — including on iPhones, where the embed cannot fade at all.
 */
export type ClipSource =
  | ({ kind: "youtube" } & Clip)
  | ({ kind: "file"; url: string } & ClipTrim);

type SongFields = Pick<
  Player,
  | "id"
  | "song_url"
  | "song_clip_path"
  | "song_start_seconds"
  | "song_end_seconds"
  | "song_fade_ms"
  | "song_loop"
>;

/**
 * The clip to play for a player, or null if they have none that can be
 * played. An uploaded file wins over a URL: it is what they went to the
 * trouble of trimming.
 */
export function resolveClip(player: SongFields): ClipSource | null {
  const trim: ClipTrim = {
    startSeconds: player.song_start_seconds ?? 0,
    endSeconds: player.song_end_seconds ?? null,
    fadeMs: player.song_fade_ms ?? 1500,
    loop: player.song_loop ?? false,
  };
  if (player.song_clip_path) {
    return { kind: "file", url: `/api/clip/${player.id}`, ...trim };
  }
  if (!player.song_url) return null;
  const videoId = extractVideoId(player.song_url);
  if (!videoId) return null;
  return { kind: "youtube", videoId, ...trim };
}

/**
 * The same clip as a walk-up: a taste, not the whole song. Capped at ten
 * seconds from the start unless the player chose a shorter end, never
 * repeated, and with a quick fade so it gets out of the way of the turn.
 */
export function walkUpOf<T extends ClipSource>(clip: T): T {
  return {
    ...clip,
    endSeconds: Math.min(
      clip.endSeconds ?? Number.POSITIVE_INFINITY,
      clip.startSeconds + WALK_UP_SECONDS,
    ),
    loop: false,
    fadeMs: Math.min(clip.fadeMs, 600),
  };
}
