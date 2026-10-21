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

/**
 * How long a sound may wait on a context that is still waking up. A tap on an
 * iPhone resumes the context and asks for its clack in the same handler; the
 * resume lands a few milliseconds later and the clack should still play. A
 * sound that would arrive later than this belongs to a moment that has passed.
 */
const LATE_MS = 400;

type Ctx = AudioContext;

/** Builds one sound into `out`, starting at `at` on the context's clock. */
export type SfxBuilder = (ctx: Ctx, out: AudioNode, at: number) => void;

/** A season's sounds: whichever it leaves out stay the classic ones. */
export type SfxPack = Partial<Record<SfxName, SfxBuilder>>;

/** Frequency of a MIDI note number (60 = middle C). */
export function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** A short burst of noise, shaped by a filter and an exponential decay. */
export function noiseBurst(
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
export function tone(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  {
    frequency,
    duration,
    gain,
    type = "triangle",
    endFrequency,
    attack,
    vibrato,
    lowpass,
  }: {
    frequency: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
    endFrequency?: number;
    /** Seconds to swell in; a bowed or sung note is slower than a struck one. */
    attack?: number;
    /** Wobble the pitch: a fiddle, a choir, a theremin. */
    vibrato?: { rate: number; depth: number };
    /** Round off a buzzy waveform (organ, horn, accordion). */
    lowpass?: number;
  },
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  if (endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
  }

  if (vibrato) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(vibrato.rate, at);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(vibrato.depth, at);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + duration);
  }

  const env = ctx.createGain();
  // A tiny attack, otherwise the start of the tone clicks.
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(
    gain,
    at + Math.min(attack ?? 0.01, duration / 2),
  );
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  if (lowpass !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    osc.connect(filter).connect(env).connect(out);
  } else {
    osc.connect(env).connect(out);
  }
  osc.start(at);
  osc.stop(at + duration);
}

/**
 * A struck bell: a handful of inharmonic partials that die away at different
 * rates. Sleigh bells, church bells, a glass being clinked, a tea-light chime.
 */
export function bell(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  { frequency, duration, gain }: { frequency: number; duration: number; gain: number },
) {
  const partials: [ratio: number, level: number, decay: number][] = [
    [1, 1, 1],
    [2.76, 0.45, 0.6],
    [5.4, 0.25, 0.35],
    [8.93, 0.12, 0.2],
  ];
  for (const [ratio, level, decay] of partials) {
    tone(ctx, out, at, {
      frequency: frequency * ratio,
      duration: Math.max(0.04, duration * decay),
      gain: gain * level,
      type: "sine",
    });
  }
}

/**
 * A plucked string by Karplus-Strong: a burst of noise fed round a short delay
 * line that averages itself smooth. Harp, fiddle pizzicato, a guitar at
 * midsommar — far more alive than any oscillator.
 */
export function pluck(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  {
    frequency,
    duration,
    gain,
    damping = 0.996,
  }: { frequency: number; duration: number; gain: number; damping?: number },
) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const period = Math.max(2, Math.round(ctx.sampleRate / frequency));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  for (let i = 0; i < frames; i++) {
    const j = i % period;
    const next = ring[(j + 1) % period];
    data[i] = ring[j];
    ring[j] = ((ring[j] + next) / 2) * damping;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(env).connect(out);
  source.start(at);
  source.stop(at + duration);
}

/** A run of notes: [midi note, seconds] pairs, played by `voice`. */
export function melody(
  notes: [note: number, length: number][],
  at: number,
  voice: (frequency: number, at: number, length: number) => void,
): number {
  let t = at;
  for (const [note, length] of notes) {
    if (note > 0) voice(midi(note), t, length);
    t += length;
  }
  return t;
}

/** Fire, a sparkler, a firework's tail: a scatter of tiny random clicks. */
export function crackle(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  { duration, count, gain }: { duration: number; count: number; gain: number },
) {
  for (let i = 0; i < count; i++) {
    noiseBurst(ctx, out, at + Math.random() * duration, {
      duration: 0.008 + Math.random() * 0.02,
      cutoff: 2500 + Math.random() * 4000,
      gain: gain * (0.4 + Math.random() * 0.6),
      type: "highpass",
    });
  }
}

const BUILDERS: Record<SfxName, SfxBuilder> =
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
  /**
   * Plays a sound in the voice of the first pack that has one — the board's
   * season first, then the week's skin — and the classic sound otherwise.
   */
  play: (name: SfxName, ...voices: (string | undefined)[]) => void;
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
export function createSfxPlayer(
  ctx: Ctx,
  packs: Partial<Record<string, SfxPack>> = {},
): SfxPlayer {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  return {
    play(name, ...voices) {
      let build: SfxBuilder = BUILDERS[name];
      for (const voice of voices) {
        const own = voice ? packs[voice]?.[name] : undefined;
        if (own) {
          build = own;
          break;
        }
      }
      if (ctx.state === "running") {
        build(ctx, master, ctx.currentTime);
        return;
      }
      if (ctx.state === "closed") return;

      // [concept: wake, then play] iOS Safari suspends the context whenever
      // it likes — after a call, a lock, a trip to another app — and only lets
      // it resume inside a tap. Most sounds are asked for inside a tap, so
      // that is exactly the moment to wake it. The sound plays once the
      // context is running, unless it took so long the moment has passed: a
      // queue of stale clacks all firing at once is worse than silence.
      const asked = Date.now();
      ctx.resume().then(
        () => {
          if (
            (ctx.state as AudioContextState) === "running" &&
            Date.now() - asked <= LATE_MS
          ) {
            build(ctx, master, ctx.currentTime);
          }
        },
        () => undefined,
      );
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
