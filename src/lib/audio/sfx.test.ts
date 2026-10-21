import { describe, expect, it, vi } from "vitest";
import {
  createSfxPlayer,
  SFX_DURATIONS,
  SFX_NAMES,
  type SfxName,
} from "@/lib/audio/sfx";
import { ALL_PACKS, CHIPTUNE, SFX_PACKS } from "@/lib/audio/sfx-packs";
import { SEASONS } from "@/lib/seasons";

/**
 * A stand-in for AudioContext that records the graph instead of making sound.
 * jsdom has no Web Audio, and asserting on audio output is not something a unit
 * test can do usefully — what matters is that each sound builds a graph, and
 * that nothing is scheduled while the context is suspended.
 */
function mockContext(state: AudioContextState = "running") {
  const started: number[] = [];
  const connections: string[] = [];

  const node = (kind: string) => {
    const n = {
      kind,
      connect: vi.fn((dest: { kind?: string }) => {
        connections.push(`${kind}->${dest.kind ?? "destination"}`);
        return dest;
      }),
    };
    return n;
  };

  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });

  const ctx: { state: AudioContextState; [key: string]: unknown } = {
    state,
    currentTime: 0,
    sampleRate: 48000,
    destination: { kind: "destination" },
    createGain: vi.fn(() => ({ ...node("gain"), gain: param() })),
    createBiquadFilter: vi.fn(() => ({
      ...node("filter"),
      type: "lowpass",
      frequency: param(),
    })),
    createBufferSource: vi.fn(() => ({
      ...node("source"),
      buffer: null,
      start: vi.fn((t: number) => started.push(t)),
      stop: vi.fn(),
    })),
    createOscillator: vi.fn(() => ({
      ...node("osc"),
      type: "sine",
      frequency: param(),
      start: vi.fn((t: number) => started.push(t)),
      stop: vi.fn(),
    })),
    createBuffer: vi.fn((_ch: number, frames: number) => ({
      getChannelData: () => new Float32Array(frames),
    })),
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    close: vi.fn(async () => {}),
  };

  return { ctx: ctx as unknown as AudioContext, started, connections, raw: ctx };
}

describe("sound catalogue", () => {
  it("has a duration for every sound", () => {
    expect(SFX_NAMES.length).toBeGreaterThan(0);
    for (const name of SFX_NAMES) {
      expect(SFX_DURATIONS[name]).toBeGreaterThan(0);
      // Nothing should outstay its welcome mid-game.
      expect(SFX_DURATIONS[name]).toBeLessThanOrEqual(1.5);
    }
  });

  it("covers every event the board and celebration need", () => {
    const required: SfxName[] = [
      "tileDown",
      "tileUp",
      "shut",
      "endTurn",
      "fanfare",
      "badge",
      "error",
    ];
    for (const name of required) expect(SFX_NAMES).toContain(name);
  });
});

describe("createSfxPlayer", () => {
  it("builds a graph for every sound without throwing", () => {
    for (const name of SFX_NAMES) {
      const { ctx, started } = mockContext("running");
      createSfxPlayer(ctx).play(name);
      expect(started.length, `${name} scheduled nothing`).toBeGreaterThan(0);
    }
  });

  it("routes everything through one master gain into the destination", () => {
    const { ctx, connections } = mockContext("running");
    createSfxPlayer(ctx).play("tileDown");
    expect(connections).toContain("gain->destination");
  });

  // Otherwise a suspended context queues the whole game up and fires it all at
  // once the moment it resumes.
  it("schedules nothing while the context is suspended", () => {
    const { ctx, started, raw } = mockContext("suspended");
    raw.resume = vi.fn(async () => {}); // a resume the browser refuses
    createSfxPlayer(ctx).play("shut");
    expect(started).toEqual([]);
  });

  // The iPhone case: the tap that asks for the clack is also the tap that
  // wakes the context, and the clack should not be lost to the race.
  it("wakes a suspended context and then plays", async () => {
    const { ctx, started, raw } = mockContext("suspended");
    createSfxPlayer(ctx).play("tileDown");
    expect(raw.resume).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(started.length).toBeGreaterThan(0);
  });

  it("drops a sound whose wake-up came too late", async () => {
    vi.useFakeTimers();
    try {
      const { ctx, started, raw } = mockContext("suspended");
      let wake!: () => void;
      raw.resume = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            wake = () => {
              raw.state = "running";
              resolve();
            };
          }),
      );
      createSfxPlayer(ctx).play("fanfare");
      vi.advanceTimersByTime(2000);
      wake();
      await Promise.resolve();
      await Promise.resolve();
      expect(started).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("plays a season's own sound when the board has one", () => {
    const classic = mockContext("running");
    createSfxPlayer(classic.ctx, SFX_PACKS).play("fanfare", "oak");
    const christmas = mockContext("running");
    createSfxPlayer(christmas.ctx, SFX_PACKS).play("fanfare", "christmas");
    expect(christmas.started.length).not.toBe(classic.started.length);
  });

  it("resumes a suspended context but leaves a running one alone", async () => {
    const suspended = mockContext("suspended");
    await createSfxPlayer(suspended.ctx).resume();
    expect(suspended.raw.resume).toHaveBeenCalled();

    const running = mockContext("running");
    await createSfxPlayer(running.ctx).resume();
    expect(running.raw.resume).not.toHaveBeenCalled();
  });
});

describe("seasonal sound packs", () => {
  it("builds a graph for every sound in every season", () => {
    for (const season of SEASONS) {
      for (const name of SFX_NAMES) {
        const { ctx, started } = mockContext("running");
        createSfxPlayer(ctx, SFX_PACKS).play(name, season);
        expect(started.length, `${season}/${name}`).toBeGreaterThan(0);
      }
    }
  });

  it("gives every season at least a fanfare or a clack of its own", () => {
    for (const season of SEASONS) {
      const pack = SFX_PACKS[season];
      expect(Object.keys(pack).length, season).toBeGreaterThan(0);
    }
  });
});

describe("voice order", () => {
  it("prefers the season, then the skin, then the classic sound", () => {
    const calls: string[] = [];
    const packs = {
      christmas: { fanfare: () => calls.push("christmas") },
      "skin:retro": { fanfare: () => calls.push("retro"), tileUp: () => calls.push("retro-up") },
    };
    const { ctx } = mockContext("running");
    const player = createSfxPlayer(ctx, packs);
    player.play("fanfare", "christmas", "skin:retro");
    player.play("tileUp", "christmas", "skin:retro");
    player.play("fanfare", "oak", "skin:cartoon");
    expect(calls).toEqual(["christmas", "retro-up"]);
  });

  it("builds every chiptune sound", () => {
    for (const name of SFX_NAMES) {
      const { ctx, started } = mockContext("running");
      createSfxPlayer(ctx, ALL_PACKS).play(name, "oak", "skin:retro");
      expect(started.length, name).toBeGreaterThan(0);
    }
    expect(Object.keys(CHIPTUNE).sort()).toEqual([...SFX_NAMES].sort());
  });
});
