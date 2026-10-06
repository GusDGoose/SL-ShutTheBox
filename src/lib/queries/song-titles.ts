import "server-only";
import { unstable_cache } from "next/cache";
import { fetchSongTitle, songLabel } from "@/lib/song-title";
import type { Player } from "@/lib/types";
import { extractVideoId } from "@/lib/youtube";

/**
 * Song titles, cached for a week per video.
 *
 * unstable_cache rather than 'use cache': the latter needs cacheComponents,
 * which this app has not turned on, and every route here is force-dynamic —
 * which turns plain fetch caching off but leaves unstable_cache working.
 * A thrown error is never cached, which is why fetchSongTitle throws on an
 * outage instead of answering "no title".
 */
const cachedTitle = unstable_cache(
  async (videoId: string) => fetchSongTitle(videoId),
  ["yt-oembed-v1"],
  { revalidate: 7 * 24 * 60 * 60, tags: ["song-title"] },
);

/** What a card says about this player's song; never throws. */
export async function songLabelFor(
  player: Pick<Player, "song_url" | "song_clip_path">,
): Promise<string | null> {
  const id = player.song_url ? extractVideoId(player.song_url) : null;
  if (player.song_clip_path || !id) return songLabel(player, null);
  try {
    return songLabel(player, await cachedTitle(id));
  } catch {
    // YouTube slow or down: say a song is set, and ask again next time.
    return songLabel(player, null);
  }
}
