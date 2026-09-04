import { describe, expect, it, vi } from "vitest";
import {
  createSfxPlayer,
  SFX_DURATIONS,
  SFX_NAMES,
  type SfxName,
} from "@/lib/audio/sfx";

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
  });

  const ctx = {
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
    resume: vi.fn(async () => {}),
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
    const { ctx, started } = mockContext("suspended");
    createSfxPlayer(ctx).play("shut");
    expect(started).toEqual([]);
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
