/**
 * The YouTube IFrame Player API, loaded once.
 *
 * A plain embed can only be told where to start. Playing a CLIP — start, end,
 * a fade at each edge, optionally on repeat — needs the real player object, so
 * the script has to be loaded and its one global callback handled.
 */

export type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

/**
 * Resolves with the YT namespace, loading the script on first call.
 *
 * The API signals readiness by calling a single global function, so this
 * memoises the promise — two players mounting at once (which is exactly what a
 * tie does) must not race to install competing callbacks.
 */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is browser-only"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);

  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API loaded without a Player"));
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube API failed to load"));
    document.head.appendChild(script);
  });

  return loading;
}

export type Clip = {
  videoId: string;
  startSeconds: number;
  /** Null plays to the end of the video. */
  endSeconds: number | null;
  fadeMs: number;
  loop: boolean;
};

/** How loud an anthem is when several play at once. */
export function mixVolume(voices: number): number {
  // Not 100/voices: sound adds logarithmically, so dividing evenly makes a
  // three-way tie sound thin and apologetic when it should sound like chaos.
  if (voices <= 1) return 100;
  return Math.round(100 / Math.sqrt(voices));
}

/**
 * Plays one clip, handling the fades and the repeat.
 *
 * Kept as a plain object rather than a hook because a tie needs several of
 * these at once and they have to be startable inside a single click — browsers
 * only allow sound to begin during a real gesture.
 */
export function createClipPlayer(
  player: YTPlayer,
  clip: Clip,
  targetVolume: number,
) {
  let raf: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const fadeSeconds = clip.fadeMs / 1000;

  function rampTo(to: number, overMs: number) {
    const from = to === 0 ? targetVolume : 0;
    const started = Date.now();
    const step = setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / Math.max(1, overMs));
      player.setVolume(Math.round(from + (to - from) * progress));
      if (progress >= 1) clearInterval(step);
    }, 40);
  }

  return {
    start() {
      stopped = false;
      player.setVolume(0);
      player.seekTo(clip.startSeconds, true);
      player.playVideo();
      rampTo(targetVolume, clip.fadeMs);

      // The API has no "tell me when you reach 1:58" event, so the clip's end
      // has to be watched for.
      raf = setInterval(() => {
        if (stopped || clip.endSeconds === null) return;
        const now = player.getCurrentTime();
        const remaining = clip.endSeconds - now;

        if (remaining <= fadeSeconds && remaining > 0) {
          player.setVolume(
            Math.round(targetVolume * Math.max(0, remaining / fadeSeconds)),
          );
        }
        if (now >= clip.endSeconds) {
          if (clip.loop) {
            player.seekTo(clip.startSeconds, true);
            rampTo(targetVolume, clip.fadeMs);
          } else {
            this.stop();
          }
        }
      }, 100);
    },

    stop() {
      stopped = true;
      if (raf) {
        clearInterval(raf);
        raf = null;
      }
      // Faded rather than cut, then actually stopped once silent.
      rampTo(0, Math.min(clip.fadeMs, 400));
      setTimeout(() => {
        try {
          player.stopVideo();
        } catch {
          // Player may already be gone; nothing to do.
        }
      }, Math.min(clip.fadeMs, 400) + 60);
    },
  };
}
