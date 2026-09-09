/**
 * The board's sound effects, synthesised at runtime with Web Audio.
 *
 * [concept: synthesised sound effects] There is no sprite file to download.
 * Every sound here is built from filtered noise and short tones, which suits
 * this app for the same reason the wood grain is an inline SVG: no requests, no
 * binary assets in the repo, and nothing to go missing. A wooden clack is a
 * noise burst through a lowpass with a fast decay — which is close to what the
 * real thing is.
 */

export type SfxName =
  | "tileDown"
  | "tileUp"
  | "shut"
  | "endTurn"
  | "fanfare"
  | "badge"
  | "error";

/** Every sound the app can make, and roughly how long it lasts. */
export const SFX_DURATIONS: Record<SfxName, number> = {
  tileDown: 0.09,
  tileUp: 0.07,
  shut: 0.6,
  endTurn: 0.25,
  fanfare: 1.2,
  badge: 0.4,
  error: 0.15,
};

export const SFX_NAMES = Object.keys(SFX_DURATIONS) as SfxName[];

const MASTER_GAIN = 0.6;

type Ctx = AudioContext;

/** A short burst of noise, shaped by a filter and an exponential decay. */
function noiseBurst(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  {
    duration,
    cutoff,
    gain,
    type = "lowpass",
  }: {
    duration: number;
    cutoff: number;
    gain: number;
    type?: BiquadFilterType;
  },
) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Fade the noise itself as well as the envelope: a raw cut sounds clicky.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = cutoff;

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(filter).connect(env).connect(out);
  source.start(at);
  source.stop(at + duration);
}

/** A short pitched tone. */
function tone(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  {
    frequency,
    duration,
    gain,
    type = "triangle",
    endFrequency,
  }: {
    frequency: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
    endFrequency?: number;
  },
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  if (endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
  }

  const env = ctx.createGain();
  // A tiny attack, otherwise the start of the tone clicks.
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.01, duration / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + duration);
}

const BUILDERS: Record<SfxName, (ctx: Ctx, out: AudioNode, at: number) => void> =
  {
    // Tile slapping down onto the tray: wooden knock plus a low thump.
    tileDown: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.09, cutoff: 1400, gain: 0.5 });
      tone(ctx, out, at, { frequency: 190, duration: 0.07, gain: 0.28 });
    },
    // Lifting a tile back up: lighter, brighter, quieter.
    tileUp: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.06, cutoff: 2600, gain: 0.24 });
    },
    // The whole board going down, then a little bell.
    shut: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.22, cutoff: 900, gain: 0.7 });
      tone(ctx, out, at + 0.06, { frequency: 880, duration: 0.5, gain: 0.22, type: "sine" });
      tone(ctx, out, at + 0.06, { frequency: 1320, duration: 0.45, gain: 0.14, type: "sine" });
    },
    // Turn handed over: a soft downward whoosh.
    endTurn: (ctx, out, at) => {
      noiseBurst(ctx, out, at, {
        duration: 0.25,
        cutoff: 1200,
        gain: 0.22,
        type: "bandpass",
      });
      tone(ctx, out, at, {
        frequency: 520,
        endFrequency: 180,
        duration: 0.22,
        gain: 0.12,
        type: "sine",
      });
    },
    // Crowning the winner: a brass-ish arpeggio.
    fanfare: (ctx, out, at) => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((frequency, i) => {
        tone(ctx, out, at + i * 0.11, {
          frequency,
          duration: i === notes.length - 1 ? 0.7 : 0.22,
          gain: 0.26,
        });
      });
    },
    // A badge landing.
    badge: (ctx, out, at) => {
      tone(ctx, out, at, {
        frequency: 880,
        endFrequency: 1760,
        duration: 0.22,
        gain: 0.18,
        type: "sine",
      });
      tone(ctx, out, at + 0.12, { frequency: 2093, duration: 0.25, gain: 0.1, type: "sine" });
    },
    // Something did not land: a dull, unmusical thud.
    error: (ctx, out, at) => {
      tone(ctx, out, at, {
        frequency: 150,
        endFrequency: 90,
        duration: 0.15,
        gain: 0.3,
        type: "square",
      });
    },
  };

export type SfxPlayer = {
  play: (name: SfxName) => void;
  /** Resume after the tab was backgrounded, or after the first user gesture. */
  resume: () => Promise<void>;
  close: () => void;
  /**
   * The context itself, for the one other thing that plays audio bytes: an
   * uploaded song clip. It rides on this context because it was unlocked by
   * a real gesture; a second context made from an effect is what Safari
   * refuses to start.
   */
  ctx: AudioContext;
};

/**
 * Creates a player over an AudioContext. Nothing makes a sound until the first
 * user gesture, which is a browser rule and also good manners on a shared desk.
 */
export function createSfxPlayer(ctx: Ctx): SfxPlayer {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  return {
    play(name) {
      // A suspended context would queue everything up and fire it all at once
      // when it resumes.
      if (ctx.state !== "running") return;
      BUILDERS[name](ctx, master, ctx.currentTime);
    },
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
    },
    close() {
      void ctx.close();
    },
    ctx,
  };
}
