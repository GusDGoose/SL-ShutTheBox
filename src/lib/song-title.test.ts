import { describe, expect, it, vi } from "vitest";
import {
  fetchSongTitle,
  oembedUrl,
  parseOEmbedTitle,
  songLabel,
  truncateTitle,
} from "@/lib/song-title";

const ID = "dQw4w9WgXcQ";

function respond(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("oembedUrl", () => {
  it("asks YouTube's public oEmbed endpoint about the watch page", () => {
    const url = new URL(oembedUrl(ID));
    expect(url.origin + url.pathname).toBe("https://www.youtube.com/oembed");
    expect(url.searchParams.get("url")).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(url.searchParams.get("format")).toBe("json");
  });
});

describe("parseOEmbedTitle", () => {
  it("reads the title, trimmed", () => {
    expect(parseOEmbedTitle({ title: "  Never Gonna Give You Up  " })).toBe(
      "Never Gonna Give You Up",
    );
  });
  it("finds nothing in anything else", () => {
    expect(parseOEmbedTitle({ title: "" })).toBeNull();
    expect(parseOEmbedTitle({ title: 7 })).toBeNull();
    expect(parseOEmbedTitle(null)).toBeNull();
  });
});

describe("truncateTitle", () => {
  it("leaves a short title alone", () => {
    expect(truncateTitle("Sandstorm", 48)).toBe("Sandstorm");
  });
  it("cuts a long one with an ellipsis, within the limit", () => {
    const cut = truncateTitle("Queen – Don't Stop Me Now (Official Video Remastered)", 24);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(24);
  });
});

describe("songLabel", () => {
  const youtube = { song_url: `https://youtu.be/${ID}`, song_clip_path: null };

  it("names the song when the title is known", () => {
    expect(songLabel(youtube, "Sandstorm")).toBe("Sandstorm");
  });
  it("still says there is a song when YouTube did not answer", () => {
    expect(songLabel(youtube, null)).toBe("Song set");
  });
  it("prefers an uploaded clip, which is what actually plays", () => {
    expect(songLabel({ ...youtube, song_clip_path: "p/clip.mp3" }, "Sandstorm")).toBe(
      "Own clip",
    );
  });
  it("says nothing when there is no song, or the link is not a video", () => {
    expect(songLabel({ song_url: null, song_clip_path: null }, null)).toBeNull();
    expect(
      songLabel({ song_url: "https://example.com/x", song_clip_path: null }, null),
    ).toBeNull();
  });
});

describe("fetchSongTitle", () => {
  it("returns the title YouTube gives", async () => {
    const f = respond(200, { title: "Sandstorm" });
    await expect(fetchSongTitle(ID, f)).resolves.toBe("Sandstorm");
    expect(f).toHaveBeenCalledWith(oembedUrl(ID), expect.anything());
  });

  // A private or removed video is a fact worth remembering for a week.
  it("answers null for a video YouTube will not describe", async () => {
    await expect(fetchSongTitle(ID, respond(404))).resolves.toBeNull();
    await expect(fetchSongTitle(ID, respond(401))).resolves.toBeNull();
  });

  // An outage is not: throwing keeps it out of the cache.
  it("throws when YouTube is having a bad day, so nothing caches it", async () => {
    await expect(fetchSongTitle(ID, respond(503))).rejects.toThrow();
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchSongTitle(ID, down)).rejects.toThrow();
  });
});
