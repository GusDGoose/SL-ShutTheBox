import type { ClipTrim } from "./clip-source";

/**
 * Plays an uploaded clip with Web Audio: exact start and end, real fades,
 * native looping. Same `start()`/`stop()` shape as the YouTube controller so
 * the anthem stage and the walk-up can hold either without caring which.
 *
 * Takes the AudioContext rather than making one: the browser only lets a
 * context start inside a user gesture, and the sound-effects layer already
 * unlocked one on the page's first tap. A second context created from an
 * effect is exactly what Safari refuses to play.
 */
export type FileClipController = {
  /** Resolves once the audio is decoded; rejects if it could not be fetched. */
  ready: Promise<void>;
  start(): void;
  stop(): void;
};

export function createFileClipPlayer(
  ctx: AudioContext,
  url: string,
  clip: ClipTrim,
  /** 0–100, matching the YouTube controller. */
  targetVolume: number,
  onEnded?: () => void,
): FileClipController {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);

  const target = Math.max(0, Math.min(1, targetVolume / 100));
  const fadeIn = Math.max(0.01, clip.fadeMs / 1000);

  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  let started = false;

  const decoded: Promise<AudioBuffer> = fetch(url, { credentials: "same-origin" })
    .then((res) => {
      if (!res.ok) throw new Error(`clip ${res.status}`);
      return res.arrayBuffer();
    })
    .then((bytes) => ctx.decodeAudioData(bytes));

  function play(buffer: AudioBuffer) {
    if (stopped || started) return;
    started = true;
    if (ctx.state !== "running") void ctx.resume();

    const from = Math.min(clip.startSeconds, Math.max(0, buffer.duration - 0.05));
    const to = Math.min(clip.endSeconds ?? buffer.duration, buffer.duration);
    const length = Math.max(0.05, to - from);
    const fade = Math.min(fadeIn, length / 2);

    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(target, now + fade);

    if (clip.loop) {
      // loopStart/loopEnd are the exact trim; the buffer plays from `from`
      // and wraps inside the slice without a gap or a click.
      source.loop = true;
      source.loopStart = from;
      source.loopEnd = to;
      source.start(now, from);
    } else {
      source.start(now, from, length);
      // Fade out over the last stretch, then let the source end itself.
      const endsAt = now + length;
      gain.gain.setValueAtTime(target, Math.max(now + fade, endsAt - fade));
      gain.gain.linearRampToValueAtTime(0, endsAt);
      source.onended = () => {
        if (!stopped) onEnded?.();
      };
    }
  }

  return {
    ready: decoded.then(() => undefined),

    start() {
      // Decoding may still be under way; play the moment it lands.
      void decoded.then(play).catch(() => undefined);
    },

    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      // Faded rather than cut, like the YouTube controller, then released.
      const out = Math.min(clip.fadeMs, 400) / 1000;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + out);
      const node = source;
      setTimeout(() => {
        try {
          node?.stop();
        } catch {
          // Already ended; nothing to stop.
        }
        node?.disconnect();
        gain.disconnect();
      }, out * 1000 + 60);
    },
  };
}
