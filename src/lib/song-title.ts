import type { Player } from "@/lib/types";
import { extractVideoId } from "@/lib/youtube";

/**
 * The name of a player's song, for the Players overview.
 *
 * Only the YouTube link is stored, so the title comes from YouTube's public
 * oEmbed endpoint — the same one any site uses to show a link preview: no key,
 * no download, nothing played. (Downloading from YouTube was ruled out for the
 * app on 2026-09-04; this is a description of the video, not the video.)
 *
 * Pure apart from the fetch, which is passed in; the cached reader lives in
 * queries/song-titles.ts.
 */

/** How long a title may be on a card before it is cut. */
export const SONG_TITLE_MAX = 48;

/** The oEmbed address that describes one video. */
export function oembedUrl(videoId: string): string {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
}

export function parseOEmbedTitle(json: unknown): string | null {
  const title = (json as { title?: unknown } | null)?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

export function truncateTitle(title: string, max = SONG_TITLE_MAX): string {
  return title.length <= max ? title : `${title.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What a card says about a player's song: the uploaded clip if there is one
 * (that is what plays), else the video's title, else that a song is set.
 * Null when there is no song to speak of.
 */
export function songLabel(
  player: Pick<Player, "song_url" | "song_clip_path">,
  title: string | null,
): string | null {
  if (player.song_clip_path) return "Own clip";
  if (!player.song_url || !extractVideoId(player.song_url)) return null;
  return title ? truncateTitle(title) : "Song set";
}

/**
 * Asks YouTube for a video's title.
 *
 * 200 gives the title. A 4xx means YouTube will not describe this video —
 * private, removed, not embeddable — which is worth remembering, so it is
 * null. Anything else throws: an outage must not be cached as "no title".
 */
export async function fetchSongTitle(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1500,
): Promise<string | null> {
  const res = await fetchImpl(oembedUrl(videoId), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.ok) return parseOEmbedTitle(await res.json());
  if (res.status >= 400 && res.status < 500) return null;
  throw new Error(`YouTube oEmbed answered ${res.status}`);
}
