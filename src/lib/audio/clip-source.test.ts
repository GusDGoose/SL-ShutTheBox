import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/types";
import { WALK_UP_SECONDS, resolveClip, walkUpOf } from "./clip-source";

function player(overrides: Partial<Player>): Player {
  return {
    id: "66841dfa-eeab-4e8f-9ef0-8ffb4e14c84c",
    name: "Alice",
    emoji: "🦊",
    song_url: null,
    song_start_seconds: 0,
    song_end_seconds: null,
    song_fade_ms: 1500,
    song_loop: false,
    song_clip_path: null,
    is_active: true,
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveClip", () => {
  it("is null for a player with no song at all", () => {
    expect(resolveClip(player({}))).toBeNull();
  });

  it("is a YouTube clip when only a URL is set, carrying the trim settings", () => {
    const clip = resolveClip(
      player({
        song_url: "https://youtu.be/dQw4w9WgXcQ",
        song_start_seconds: 90,
        song_end_seconds: 120,
        song_fade_ms: 800,
        song_loop: true,
      }),
    );
    expect(clip).toEqual({
      kind: "youtube",
      videoId: "dQw4w9WgXcQ",
      startSeconds: 90,
      endSeconds: 120,
      fadeMs: 800,
      loop: true,
    });
  });

  it("is null when the URL is not something YouTube would play", () => {
    expect(resolveClip(player({ song_url: "https://example.com/song.mp3" }))).toBeNull();
  });

  // The uploaded file wins over the URL: it is what the player went to the
  // trouble of trimming, and it fades on iPhones where the embed cannot.
  it("is a file clip when an upload exists, even if a URL is also set", () => {
    const clip = resolveClip(
      player({
        song_url: "https://youtu.be/dQw4w9WgXcQ",
        song_clip_path: "66841dfa-eeab-4e8f-9ef0-8ffb4e14c84c.mp3",
        song_start_seconds: 5,
      }),
    );
    expect(clip).toEqual({
      kind: "file",
      url: "/api/clip/66841dfa-eeab-4e8f-9ef0-8ffb4e14c84c",
      startSeconds: 5,
      endSeconds: null,
      fadeMs: 1500,
      loop: false,
    });
  });
});

describe("walkUpOf", () => {
  it("caps a walk-up at ten seconds from the start when no end is set", () => {
    const clip = resolveClip(player({ song_url: "https://youtu.be/dQw4w9WgXcQ", song_start_seconds: 30 }))!;
    expect(walkUpOf(clip).endSeconds).toBe(30 + WALK_UP_SECONDS);
  });

  it("keeps a shorter end the player chose", () => {
    const clip = resolveClip(
      player({ song_url: "https://youtu.be/dQw4w9WgXcQ", song_start_seconds: 30, song_end_seconds: 35 }),
    )!;
    expect(walkUpOf(clip).endSeconds).toBe(35);
  });

  it("trims a longer end down to ten seconds — a walk-up is an entrance, not a set", () => {
    const clip = resolveClip(
      player({ song_url: "https://youtu.be/dQw4w9WgXcQ", song_start_seconds: 30, song_end_seconds: 90 }),
    )!;
    expect(walkUpOf(clip).endSeconds).toBe(40);
  });

  it("never repeats", () => {
    const clip = resolveClip(player({ song_url: "https://youtu.be/dQw4w9WgXcQ", song_loop: true }))!;
    expect(walkUpOf(clip).loop).toBe(false);
  });
});
