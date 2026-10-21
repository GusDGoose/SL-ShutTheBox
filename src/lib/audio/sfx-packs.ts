/**
 * Every season's voice: the same seven moments as the classic board, played on
 * different instruments. Synthesised like the rest of src/lib/audio/sfx.ts, so
 * a whole year of sound effects costs no downloads at all.
 *
 * A pack only lists what it changes; anything it leaves out keeps the classic
 * wooden clack. The tunes are all traditional and long out of copyright.
 */
import type { Season } from "@/lib/seasons";
import {
  bell,
  crackle,
  melody,
  midi,
  noiseBurst,
  pluck,
  tone,
  type SfxPack,
} from "./sfx";

type Ctx = AudioContext;

// ---------------------------------------------------------------------------
// Instruments, built from the primitives in sfx.ts.

function sleighBells(ctx: Ctx, out: AudioNode, at: number, shakes: number, gain: number) {
  for (let i = 0; i < shakes; i++) {
    const t = at + i * 0.035 + Math.random() * 0.015;
    bell(ctx, out, t, { frequency: 2200 + Math.random() * 1400, duration: 0.18, gain });
  }
  noiseBurst(ctx, out, at, { duration: 0.06 + shakes * 0.03, cutoff: 6000, gain: gain * 0.6, type: "highpass" });
}

function organ(ctx: Ctx, out: AudioNode, frequency: number, at: number, length: number, gain = 0.1) {
  tone(ctx, out, at, { frequency, duration: length + 0.08, gain, type: "square", lowpass: 1800, attack: 0.02 });
  tone(ctx, out, at, { frequency: frequency / 2, duration: length + 0.08, gain: gain * 0.9, type: "sawtooth", lowpass: 1200, attack: 0.02 });
}

function horn(ctx: Ctx, out: AudioNode, frequency: number, at: number, length: number, gain = 0.14) {
  for (const detune of [1, 1.006, 1.5]) {
    tone(ctx, out, at, { frequency: frequency * detune, duration: length, gain: detune === 1.5 ? gain * 0.4 : gain, type: "sawtooth", lowpass: 650, attack: 0.08 });
  }
}

function accordion(ctx: Ctx, out: AudioNode, frequency: number, at: number, length: number, gain = 0.07) {
  tone(ctx, out, at, { frequency, duration: length, gain, type: "square", lowpass: 2400, attack: 0.03 });
  tone(ctx, out, at, { frequency: frequency * 1.008, duration: length, gain, type: "square", lowpass: 2400, attack: 0.03 });
}

function fiddle(ctx: Ctx, out: AudioNode, frequency: number, at: number, length: number, gain = 0.1) {
  tone(ctx, out, at, { frequency, duration: length + 0.04, gain, type: "sawtooth", lowpass: 3200, attack: 0.035, vibrato: { rate: 5.5, depth: frequency * 0.008 } });
}

function choir(ctx: Ctx, out: AudioNode, notes: number[], at: number, length: number, gain = 0.06) {
  for (const note of notes) {
    const frequency = midi(note);
    tone(ctx, out, at, { frequency, duration: length, gain, type: "sawtooth", lowpass: 1100, attack: 0.25, vibrato: { rate: 4.8, depth: frequency * 0.006 } });
    tone(ctx, out, at, { frequency: frequency * 1.004, duration: length, gain: gain * 0.7, type: "triangle", attack: 0.3 });
  }
}

function brass(ctx: Ctx, out: AudioNode, frequency: number, at: number, length: number, gain = 0.12) {
  tone(ctx, out, at, { frequency, duration: length + 0.05, gain, type: "sawtooth", lowpass: 1900, attack: 0.03 });
}

function marimba(ctx: Ctx, out: AudioNode, frequency: number, at: number, gain = 0.25) {
  tone(ctx, out, at, { frequency, duration: 0.45, gain, type: "sine" });
  tone(ctx, out, at, { frequency: frequency * 4, duration: 0.07, gain: gain * 0.25, type: "sine" });
  noiseBurst(ctx, out, at, { duration: 0.02, cutoff: 1800, gain: gain * 0.4 });
}

function chirp(ctx: Ctx, out: AudioNode, at: number, gain = 0.08) {
  const base = 2600 + Math.random() * 800;
  tone(ctx, out, at, { frequency: base, endFrequency: base * 1.6, duration: 0.06, gain, type: "sine" });
  tone(ctx, out, at + 0.08, { frequency: base * 1.2, endFrequency: base * 1.8, duration: 0.05, gain: gain * 0.8, type: "sine" });
}

function plop(ctx: Ctx, out: AudioNode, at: number, gain = 0.3) {
  tone(ctx, out, at, { frequency: 260, endFrequency: 900, duration: 0.08, gain, type: "sine" });
}

function raindrop(ctx: Ctx, out: AudioNode, at: number, gain = 0.14) {
  const f = 1500 + Math.random() * 900;
  tone(ctx, out, at, { frequency: f, endFrequency: f * 1.6, duration: 0.05, gain, type: "sine" });
}

function crunch(ctx: Ctx, out: AudioNode, at: number, gain = 0.4) {
  for (let i = 0; i < 4; i++) {
    noiseBurst(ctx, out, at + i * 0.018, { duration: 0.03, cutoff: 1500 + i * 600, gain: gain * (1 - i * 0.18), type: "highpass" });
  }
  tone(ctx, out, at, { frequency: 140, duration: 0.06, gain: gain * 0.4 });
}

function rustle(ctx: Ctx, out: AudioNode, at: number, gain = 0.18) {
  for (let i = 0; i < 6; i++) {
    noiseBurst(ctx, out, at + i * 0.02 + Math.random() * 0.01, { duration: 0.035, cutoff: 3000 + Math.random() * 2000, gain, type: "bandpass" });
  }
}

function whistleUp(ctx: Ctx, out: AudioNode, at: number, length = 0.4) {
  tone(ctx, out, at, { frequency: 700, endFrequency: 2600, duration: length, gain: 0.06, type: "sine", attack: 0.05 });
  noiseBurst(ctx, out, at, { duration: length, cutoff: 3000, gain: 0.05, type: "bandpass" });
}

function boom(ctx: Ctx, out: AudioNode, at: number, gain = 0.6) {
  noiseBurst(ctx, out, at, { duration: 0.5, cutoff: 380, gain });
  tone(ctx, out, at, { frequency: 80, endFrequency: 38, duration: 0.45, gain: gain * 0.6, type: "sine" });
  crackle(ctx, out, at + 0.08, { duration: 0.6, count: 22, gain: 0.18 });
}

function cork(ctx: Ctx, out: AudioNode, at: number) {
  noiseBurst(ctx, out, at, { duration: 0.04, cutoff: 1500, gain: 0.5, type: "bandpass" });
  tone(ctx, out, at, { frequency: 320, endFrequency: 1100, duration: 0.06, gain: 0.3, type: "sine" });
}

function plucked(ctx: Ctx, out: AudioNode, frequency: number, at: number, duration: number, gain: number) {
  pluck(ctx, out, at, { frequency, duration, gain });
}

function harpGliss(ctx: Ctx, out: AudioNode, at: number, notes: number[], step = 0.045, gain = 0.32) {
  notes.forEach((note, i) => pluck(ctx, out, at + i * step, { frequency: midi(note), duration: 0.9, gain }));
  return at + notes.length * step;
}

// ---------------------------------------------------------------------------
// The packs.

export const SFX_PACKS: Record<Season, SfxPack> = {
  newyear: {
    shut: (ctx, out, at) => {
      cork(ctx, out, at);
      crackle(ctx, out, at + 0.05, { duration: 0.5, count: 26, gain: 0.14 });
    },
    // Two rockets, two bursts, a cork, and the room cheering in sparks.
    fanfare: (ctx, out, at) => {
      whistleUp(ctx, out, at, 0.38);
      boom(ctx, out, at + 0.38);
      whistleUp(ctx, out, at + 0.25, 0.42);
      boom(ctx, out, at + 0.67, 0.45);
      cork(ctx, out, at + 1.05);
    },
    badge: (ctx, out, at) => {
      [84, 88, 91, 96].forEach((n, i) => bell(ctx, out, at + i * 0.05, { frequency: midi(n), duration: 0.35, gain: 0.05 }));
    },
  },

  frost: {
    tileDown: (ctx, out, at) => crunch(ctx, out, at),
    tileUp: (ctx, out, at) => crunch(ctx, out, at, 0.18),
    shut: (ctx, out, at) => {
      crunch(ctx, out, at, 0.5);
      [96, 91, 88, 84].forEach((n, i) => bell(ctx, out, at + 0.06 + i * 0.07, { frequency: midi(n), duration: 0.5, gain: 0.06 }));
    },
    // Ice chimes: a celesta arpeggio.
    fanfare: (ctx, out, at) => {
      melody([[84, 0.1], [88, 0.1], [91, 0.1], [96, 0.1], [91, 0.1], [96, 0.6]], at, (f, t) =>
        bell(ctx, out, t, { frequency: f, duration: 0.7, gain: 0.08 }),
      );
    },
    badge: (ctx, out, at) => bell(ctx, out, at, { frequency: midi(96), duration: 0.5, gain: 0.08 }),
  },

  valentine: {
    tileUp: (ctx, out, at) => pluck(ctx, out, at, { frequency: midi(79), duration: 0.35, gain: 0.18 }),
    shut: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.18, cutoff: 900, gain: 0.5 });
      harpGliss(ctx, out, at + 0.05, [72, 76, 79, 84], 0.05, 0.2);
    },
    // A harp glissando up two octaves, landing on a chord.
    fanfare: (ctx, out, at) => {
      const end = harpGliss(ctx, out, at, [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84], 0.04);
      for (const n of [72, 76, 79, 84]) pluck(ctx, out, end + 0.05, { frequency: midi(n), duration: 1.0, gain: 0.25 });
    },
    badge: (ctx, out, at) => harpGliss(ctx, out, at, [79, 84, 88], 0.06, 0.22),
  },

  semla: {
    tileDown: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.1, cutoff: 700, gain: 0.35 });
      tone(ctx, out, at, { frequency: 170, duration: 0.07, gain: 0.18 });
    },
    badge: (ctx, out, at) => bell(ctx, out, at, { frequency: midi(76), duration: 0.6, gain: 0.1 }),
    fanfare: (ctx, out, at) => {
      melody([[67, 0.12], [72, 0.12], [76, 0.12], [79, 0.7]], at, (f, t) => bell(ctx, out, t, { frequency: f, duration: 0.8, gain: 0.09 }));
    },
  },

  spring: {
    tileDown: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.04, cutoff: 1300, gain: 0.45, type: "bandpass" });
      tone(ctx, out, at, { frequency: 880, duration: 0.05, gain: 0.12, type: "sine" });
    },
    badge: (ctx, out, at) => {
      chirp(ctx, out, at);
      chirp(ctx, out, at + 0.2);
    },
    fanfare: (ctx, out, at) => {
      melody([[72, 0.1], [74, 0.1], [76, 0.1], [79, 0.1], [81, 0.1], [84, 0.5]], at, (f, t) => marimba(ctx, out, f, t));
      chirp(ctx, out, at + 0.65);
      chirp(ctx, out, at + 0.9);
    },
  },

  easter: {
    tileUp: (ctx, out, at) => tone(ctx, out, at, { frequency: 3200, endFrequency: 4400, duration: 0.05, gain: 0.07, type: "sine" }),
    badge: (ctx, out, at) => {
      for (let i = 0; i < 3; i++) tone(ctx, out, at + i * 0.09, { frequency: 3000, endFrequency: 4500, duration: 0.05, gain: 0.08, type: "sine" });
    },
    // Two cuckoos and a chorus of chicks.
    fanfare: (ctx, out, at) => {
      melody([[79, 0.2], [76, 0.3], [79, 0.2], [76, 0.4]], at, (f, t, l) =>
        tone(ctx, out, t, { frequency: f, duration: l * 0.9, gain: 0.18, type: "triangle", lowpass: 1600, attack: 0.02 }),
      );
      for (let i = 0; i < 4; i++) tone(ctx, out, at + 1.0 + i * 0.07, { frequency: 3000, endFrequency: 4500, duration: 0.05, gain: 0.07, type: "sine" });
    },
  },

  tulip: {
    tileUp: (ctx, out, at) => raindrop(ctx, out, at),
    endTurn: (ctx, out, at) => {
      for (let i = 0; i < 4; i++) raindrop(ctx, out, at + i * 0.05 + Math.random() * 0.02, 0.08);
    },
    fanfare: (ctx, out, at) => {
      melody([[76, 0.1], [79, 0.1], [84, 0.1], [83, 0.1], [79, 0.1], [84, 0.5]], at, (f, t) => marimba(ctx, out, f, t, 0.22));
      for (let i = 0; i < 5; i++) raindrop(ctx, out, at + 0.7 + i * 0.08, 0.07);
    },
  },

  valborg: {
    shut: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.4, cutoff: 300, gain: 0.6 });
      crackle(ctx, out, at, { duration: 0.6, count: 30, gain: 0.2 });
    },
    endTurn: (ctx, out, at) => crackle(ctx, out, at, { duration: 0.25, count: 10, gain: 0.15 }),
    // Spring sung in round the bonfire: a swelling choir over the crackle.
    fanfare: (ctx, out, at) => {
      choir(ctx, out, [60, 64, 67], at, 0.6);
      choir(ctx, out, [65, 69, 72], at + 0.5, 0.45);
      choir(ctx, out, [67, 72, 76], at + 0.85, 0.6);
      crackle(ctx, out, at, { duration: 1.3, count: 30, gain: 0.12 });
    },
  },

  bloom: {
    tileUp: (ctx, out, at) => marimba(ctx, out, midi(84), at, 0.12),
    fanfare: (ctx, out, at) => {
      melody([[72, 0.09], [74, 0.09], [76, 0.09], [79, 0.09], [81, 0.09], [84, 0.09], [81, 0.09], [84, 0.5]], at, (f, t) => marimba(ctx, out, f, t));
    },
    badge: (ctx, out, at) => {
      marimba(ctx, out, midi(88), at, 0.18);
      marimba(ctx, out, midi(91), at + 0.1, 0.18);
    },
  },

  nationalday: {
    // A proper brass fanfare: ta-ta-ta-taaa.
    fanfare: (ctx, out, at) => {
      melody([[67, 0.12], [67, 0.08], [72, 0.15], [76, 0.15], [79, 0.15]], at, (f, t, l) => brass(ctx, out, f, t, l));
      for (const n of [72, 76, 79]) brass(ctx, out, midi(n), at + 0.65, 0.6, 0.09);
    },
    badge: (ctx, out, at) => {
      brass(ctx, out, midi(72), at, 0.1);
      brass(ctx, out, midi(79), at + 0.12, 0.25);
    },
  },

  midsommar: {
    tileUp: (ctx, out, at) => pluck(ctx, out, at, { frequency: midi(81), duration: 0.3, gain: 0.16 }),
    // A fiddler's polska run round the maypole.
    fanfare: (ctx, out, at) => {
      const end = melody([[74, 0.11], [78, 0.11], [81, 0.11], [78, 0.11], [74, 0.11], [81, 0.11], [86, 0.11]], at, (f, t, l) => fiddle(ctx, out, f, t, l));
      fiddle(ctx, out, midi(86), end, 0.45);
      fiddle(ctx, out, midi(78), end, 0.45, 0.06);
    },
    badge: (ctx, out, at) => {
      chirp(ctx, out, at);
      pluck(ctx, out, at + 0.1, { frequency: midi(86), duration: 0.4, gain: 0.18 });
    },
  },

  summer: {
    tileDown: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.07, cutoff: 1300, gain: 0.35 });
      plop(ctx, out, at + 0.01, 0.2);
    },
    tileUp: (ctx, out, at) => plop(ctx, out, at, 0.16),
    // The ferry's horn, twice, as she leaves the quay.
    fanfare: (ctx, out, at) => {
      horn(ctx, out, midi(41), at, 0.45);
      horn(ctx, out, midi(41), at + 0.55, 0.85);
      tone(ctx, out, at + 1.1, { frequency: 1900, endFrequency: 1300, duration: 0.2, gain: 0.05, type: "sine", vibrato: { rate: 18, depth: 60 } });
    },
    badge: (ctx, out, at) => {
      tone(ctx, out, at, { frequency: 1900, endFrequency: 1250, duration: 0.18, gain: 0.07, type: "sine", vibrato: { rate: 20, depth: 70 } });
      tone(ctx, out, at + 0.2, { frequency: 1800, endFrequency: 1200, duration: 0.18, gain: 0.06, type: "sine", vibrato: { rate: 20, depth: 70 } });
    },
  },

  kraftskiva: {
    // Glasses up: skål!
    badge: (ctx, out, at) => {
      bell(ctx, out, at, { frequency: 2600, duration: 0.5, gain: 0.08 });
      bell(ctx, out, at + 0.04, { frequency: 2950, duration: 0.45, gain: 0.06 });
    },
    // The accordion stomps through a cadence, then everyone clinks.
    fanfare: (ctx, out, at) => {
      const chords: [number[], number][] = [
        [[65, 69, 72], 0.2],
        [[70, 74, 77], 0.2],
        [[72, 76, 79], 0.2],
        [[65, 69, 72, 77], 0.5],
      ];
      let t = at;
      for (const [notes, length] of chords) {
        for (const n of notes) accordion(ctx, out, midi(n), t, length * 0.92, 0.05);
        t += length;
      }
      bell(ctx, out, t - 0.2, { frequency: 2600, duration: 0.45, gain: 0.08 });
      bell(ctx, out, t - 0.15, { frequency: 3050, duration: 0.4, gain: 0.07 });
    },
  },

  harvest: {
    tileDown: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.12, cutoff: 600, gain: 0.55 });
      tone(ctx, out, at, { frequency: 115, duration: 0.11, gain: 0.32 });
    },
    fanfare: (ctx, out, at) => {
      const end = melody([[67, 0.1], [71, 0.1], [74, 0.1], [79, 0.1], [74, 0.1], [79, 0.1]], at, (f, t) => plucked(ctx, out, f, t, 0.6, 0.3));
      for (const n of [67, 71, 74, 79]) pluck(ctx, out, end + Math.random() * 0.02, { frequency: midi(n), duration: 0.9, gain: 0.22 });
    },
  },

  autumn: {
    tileUp: (ctx, out, at) => rustle(ctx, out, at),
    endTurn: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.35, cutoff: 700, gain: 0.18, type: "bandpass" });
      rustle(ctx, out, at + 0.05, 0.1);
    },
    fanfare: (ctx, out, at) => {
      const end = melody([[69, 0.12], [72, 0.12], [76, 0.12], [81, 0.12], [79, 0.12], [76, 0.12]], at, (f, t) => plucked(ctx, out, f, t, 0.7, 0.28));
      for (const n of [69, 72, 76, 81]) pluck(ctx, out, end, { frequency: midi(n), duration: 0.8, gain: 0.2 });
      rustle(ctx, out, end, 0.12);
    },
  },

  halloween: {
    // Bach's Toccata in D minor, on the haunted organ.
    fanfare: (ctx, out, at) => {
      melody(
        [[81, 0.06], [79, 0.06], [81, 0.38], [0, 0.08], [79, 0.06], [77, 0.06], [76, 0.06], [74, 0.06], [73, 0.2], [74, 0.4]],
        at,
        (f, t, l) => organ(ctx, out, f, t, l),
      );
    },
    endTurn: (ctx, out, at) => {
      // A creaking door.
      tone(ctx, out, at, { frequency: 110, endFrequency: 190, duration: 0.35, gain: 0.08, type: "sawtooth", lowpass: 1400, vibrato: { rate: 22, depth: 30 } });
    },
    badge: (ctx, out, at) => {
      // Theremin: oooOOOooo.
      tone(ctx, out, at, { frequency: 620, endFrequency: 1100, duration: 0.45, gain: 0.1, type: "sine", attack: 0.12, vibrato: { rate: 6, depth: 22 } });
    },
    shut: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.55, cutoff: 260, gain: 0.7 });
      for (const n of [50, 53, 57]) organ(ctx, out, midi(n), at + 0.05, 0.45, 0.06);
    },
    error: (ctx, out, at) => {
      organ(ctx, out, midi(38), at, 0.15, 0.08);
      organ(ctx, out, midi(39), at, 0.15, 0.08);
    },
  },

  candlelight: {
    badge: (ctx, out, at) => bell(ctx, out, at, { frequency: midi(84), duration: 0.6, gain: 0.07 }),
    shut: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.2, cutoff: 800, gain: 0.55 });
      bell(ctx, out, at + 0.06, { frequency: midi(79), duration: 0.7, gain: 0.09 });
    },
    fanfare: (ctx, out, at) => {
      melody([[72, 0.16], [76, 0.16], [79, 0.16], [84, 0.7]], at, (f, t) => bell(ctx, out, t, { frequency: f, duration: 0.9, gain: 0.08 }));
    },
  },

  christmas: {
    tileDown: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.08, cutoff: 1300, gain: 0.4 });
      sleighBells(ctx, out, at, 2, 0.035);
    },
    endTurn: (ctx, out, at) => sleighBells(ctx, out, at, 5, 0.03),
    shut: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.22, cutoff: 900, gain: 0.6 });
      sleighBells(ctx, out, at, 8, 0.035);
      bell(ctx, out, at + 0.1, { frequency: midi(84), duration: 0.6, gain: 0.08 });
    },
    // Jingle bells, jingle bells, jingle all the way.
    fanfare: (ctx, out, at) => {
      const q = 0.085;
      melody(
        [[76, q], [76, q], [76, 2 * q], [76, q], [76, q], [76, 2 * q], [76, q], [79, q], [72, 1.5 * q], [74, 0.5 * q], [76, 4 * q]],
        at,
        (f, t) => bell(ctx, out, t, { frequency: f, duration: 0.45, gain: 0.1 }),
      );
      sleighBells(ctx, out, at, 6, 0.025);
      sleighBells(ctx, out, at + 0.68, 6, 0.025);
    },
    badge: (ctx, out, at) => bell(ctx, out, at, { frequency: midi(88), duration: 0.5, gain: 0.09 }),
  },

  lucia: {
    // A choir in white, candles in their hair.
    fanfare: (ctx, out, at) => {
      choir(ctx, out, [69, 73, 76], at, 0.55);
      choir(ctx, out, [74, 78, 81], at + 0.45, 0.4);
      choir(ctx, out, [76, 80, 83], at + 0.75, 0.3);
      choir(ctx, out, [69, 73, 76, 81], at + 0.95, 0.5);
      bell(ctx, out, at + 0.95, { frequency: midi(93), duration: 0.5, gain: 0.05 });
    },
    badge: (ctx, out, at) => bell(ctx, out, at, { frequency: midi(88), duration: 0.6, gain: 0.08 }),
    shut: (ctx, out, at) => {
      noiseBurst(ctx, out, at, { duration: 0.2, cutoff: 900, gain: 0.55 });
      choir(ctx, out, [69, 73, 76], at + 0.05, 0.5, 0.05);
    },
  },
};

/** The pack for a board, if it has one. */
export function packFor(theme: string | undefined): SfxPack | undefined {
  return theme ? (SFX_PACKS as Partial<Record<string, SfxPack>>)[theme] : undefined;
}

