import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClipPlayer, mixVolume, type Clip } from "@/lib/audio/youtube-api";

const CLIP: Clip = {
  videoId: "dQw4w9WgXcQ",
  startSeconds: 90, // 1:30
  endSeconds: 120, // 2:00
  fadeMs: 1000,
  loop: false,
};

/** Stands in for a YT.Player, recording what it was told to do. */
function mockPlayer(startAt = 90) {
  let current = startAt;
  const volumes: number[] = [];
  return {
    at(seconds: number) {
      current = seconds;
    },
    volumes,
    player: {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      stopVideo: vi.fn(),
      seekTo: vi.fn((seconds: number) => {
        current = seconds;
      }),
      setVolume: vi.fn((v: number) => volumes.push(v)),
      getCurrentTime: () => current,
      destroy: vi.fn(),
    },
  };
}

describe("mixVolume", () => {
  it("gives a lone anthem the full volume", () => {
    expect(mixVolume(1)).toBe(100);
    expect(mixVolume(0)).toBe(100);
  });

  // Dividing evenly (100/n) makes a three-way tie sound thin and apologetic
  // when it should sound like chaos — sound adds logarithmically, so the
  // square root keeps the combined loudness roughly constant.
  it("scales by the square root, not evenly", () => {
    expect(mixVolume(2)).toBe(71);
    expect(mixVolume(3)).toBe(58);
    expect(mixVolume(4)).toBe(50);
    expect(mixVolume(2)).toBeGreaterThan(100 / 2);
    expect(mixVolume(3)).toBeGreaterThan(100 / 3);
  });

  it("never goes silent however many win", () => {
    for (let n = 1; n <= 12; n++) {
      expect(mixVolume(n)).toBeGreaterThan(0);
      expect(mixVolume(n)).toBeLessThanOrEqual(100);
    }
  });
});

describe("createClipPlayer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts silent at the clip's start, then plays", () => {
    const m = mockPlayer();
    createClipPlayer(m.player, CLIP, 100).start();

    // Silent first: the fade-in has to start from nothing or there is a click.
    expect(m.volumes[0]).toBe(0);
    expect(m.player.seekTo).toHaveBeenCalledWith(90, true);
    expect(m.player.playVideo).toHaveBeenCalled();
  });

  it("fades in to the target volume", () => {
    const m = mockPlayer();
    createClipPlayer(m.player, CLIP, 80).start();
    vi.advanceTimersByTime(1100);
    expect(m.volumes.at(-1)).toBe(80);
  });

  it("fades in to a mixed volume when sharing the stage", () => {
    const m = mockPlayer();
    createClipPlayer(m.player, CLIP, mixVolume(2)).start();
    vi.advanceTimersByTime(1100);
    expect(m.volumes.at(-1)).toBe(71);
  });

  it("ducks as the clip's end approaches", () => {
    const m = mockPlayer();
    createClipPlayer(m.player, CLIP, 100).start();
    vi.advanceTimersByTime(1100); // fade-in done, at full volume

    // Half a second from the end of a one second fade.
    m.at(119.5);
    vi.advanceTimersByTime(150);
    const ducked = m.volumes.at(-1)!;
    expect(ducked).toBeLessThan(100);
    expect(ducked).toBeGreaterThan(0);
  });

  it("stops at the end when it is not looping", () => {
    const m = mockPlayer();
    createClipPlayer(m.player, CLIP, 100).start();
    vi.advanceTimersByTime(1100);

    m.at(120.5);
    vi.advanceTimersByTime(150);
    vi.advanceTimersByTime(1000); // let the stop fade run out
    expect(m.player.stopVideo).toHaveBeenCalled();
  });

  it("goes back to the start when it is looping", () => {
    const m = mockPlayer();
    createClipPlayer(m.player, { ...CLIP, loop: true }, 100).start();
    vi.advanceTimersByTime(1100);
    m.player.seekTo.mockClear();

    m.at(120.5);
    vi.advanceTimersByTime(150);
    expect(m.player.seekTo).toHaveBeenCalledWith(90, true);
    expect(m.player.stopVideo).not.toHaveBeenCalled();
  });

  it("plays to the end of the video when no end is set", () => {
    const m = mockPlayer(10);
    createClipPlayer(m.player, { ...CLIP, endSeconds: null }, 100).start();
    vi.advanceTimersByTime(1100);

    m.at(9999);
    vi.advanceTimersByTime(300);
    expect(m.player.stopVideo).not.toHaveBeenCalled();
  });

  it("fades out rather than cutting when stopped by hand", () => {
    const m = mockPlayer();
    const controller = createClipPlayer(m.player, CLIP, 100);
    controller.start();
    vi.advanceTimersByTime(1100);

    controller.stop();
    vi.advanceTimersByTime(200);
    // Still on its way down, not silenced instantly.
    expect(m.player.stopVideo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(m.player.stopVideo).toHaveBeenCalled();
  });

  it("stops watching the clock once stopped", () => {
    const m = mockPlayer();
    const controller = createClipPlayer(m.player, { ...CLIP, loop: true }, 100);
    controller.start();
    vi.advanceTimersByTime(1100);
    controller.stop();
    vi.advanceTimersByTime(1200);
    m.player.seekTo.mockClear();

    // A looping clip whose watcher kept running would seek back for ever.
    m.at(120.5);
    vi.advanceTimersByTime(500);
    expect(m.player.seekTo).not.toHaveBeenCalled();
  });
});
