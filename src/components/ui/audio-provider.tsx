"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createSfxPlayer, type SfxName, type SfxPlayer } from "@/lib/audio/sfx";
import { ALL_PACKS } from "@/lib/audio/sfx-packs";

const SOUND_KEY = "stb.sound";

/**
 * [concept: external store for browser state] The mute preference lives in
 * localStorage, which the server cannot see. Reading it in an effect and
 * calling setState would render once with the wrong value and once with the
 * right one; useSyncExternalStore is the supported way to subscribe to state
 * that lives outside React, with an explicit server snapshot.
 */
const muteStore = (() => {
  const listeners = new Set<() => void>();
  let cached: boolean | null = null;

  function read(): boolean {
    try {
      return window.localStorage.getItem(SOUND_KEY) === "off";
    } catch {
      // Private windows and blocked site data both throw here.
      return false;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): boolean {
      if (cached === null) cached = read();
      return cached;
    },
    // Sound is on until the browser tells us otherwise.
    getServerSnapshot(): boolean {
      return false;
    },
    set(next: boolean) {
      cached = next;
      try {
        window.localStorage.setItem(SOUND_KEY, next ? "off" : "on");
      } catch {
        // The preference just will not persist; muting still works this session.
      }
      listeners.forEach((listener) => listener());
    },
  };
})();

/**
 * An iPhone mutes Web Audio while its ring/silent switch is on, which on an
 * office desk is nearly always. Declaring this page a media player (Safari
 * 16.4+) makes the sounds play anyway; the mute toggle in the header is the
 * way to silence the app.
 */
function allowPlaybackInSilentMode() {
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  if (!session) return;
  try {
    session.type = "playback";
  } catch {
    // An older Safari that has the object but not this type.
  }
}

type AudioApi = {
  play: (name: SfxName) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** The unlocked AudioContext, or null before the first gesture. */
  audioContext: () => AudioContext | null;
};

const AudioContextValue = createContext<AudioApi | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<SfxPlayer | null>(null);
  const muted = useSyncExternalStore(
    muteStore.subscribe,
    muteStore.getSnapshot,
    muteStore.getServerSnapshot,
  );

  // [concept: audio unlock] A browser will not let a page make noise until the
  // user has interacted with it, so the AudioContext is created on the first
  // gesture rather than on mount.
  //
  // [concept: iPhone unlock] This used to listen for one `pointerdown` and then
  // stop listening. On an iPhone a finger going down is not a gesture that may
  // start audio — only the finger coming up is (`touchend`, `pointerup`,
  // `click`) — so the context was born suspended, the resume was refused, the
  // listener was gone, and the phone stayed silent for the rest of the visit.
  // Now every gesture gets a chance to wake it, and it is cheap once running.
  // iOS also suspends ("interrupts") a running context after a call or a trip
  // to another app, which the same listeners recover from.
  useEffect(() => {
    const unlock = () => {
      let player = playerRef.current;
      if (!player) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        allowPlaybackInSilentMode();
        const ctx = new Ctor();
        player = createSfxPlayer(ctx, ALL_PACKS);
        playerRef.current = player;
      }
      const ctx = player.ctx;
      if (ctx.state === "running") return;
      void player.resume().catch(() => undefined);
      // Old WebKit only counts the context as unlocked once something has
      // actually been played inside the gesture: one silent frame does it.
      try {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        source.connect(ctx.destination);
        source.start(0);
      } catch {
        // Nothing to warm up; the resume above is what matters.
      }
    };

    // Returning from another tab suspends the context on some browsers.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void playerRef.current?.resume().catch(() => undefined);
      }
    };

    const gestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
    for (const type of gestures) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const type of gestures) {
        window.removeEventListener(type, unlock, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const play = useCallback(
    (name: SfxName) => {
      if (muted) return;
      // In the voice of whichever board is on — sleigh bells at Christmas, the
      // ferry's horn in July — then of the week's skin (8-bit on a 90s week).
      // Read at play time, so a change applies to the very next clack.
      const { theme, skin } = document.documentElement.dataset;
      playerRef.current?.play(name, theme, `skin:${skin}`);
    },
    [muted],
  );

  const value = useMemo<AudioApi>(
    () => ({
      play,
      muted,
      setMuted: muteStore.set,
      audioContext: () => playerRef.current?.ctx ?? null,
    }),
    [play, muted],
  );

  return (
    <AudioContextValue.Provider value={value}>
      {children}
    </AudioContextValue.Provider>
  );
}

/**
 * Sound effects. Safe to call outside an AudioProvider — it returns a no-op, so
 * a component can be rendered in a test or in isolation without wiring audio.
 */
export function useSfx(): AudioApi {
  return (
    useContext(AudioContextValue) ?? {
      play: () => {},
      muted: true,
      setMuted: () => {},
      audioContext: () => null,
    }
  );
}
