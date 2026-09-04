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

type AudioApi = {
  play: (name: SfxName) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
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
  useEffect(() => {
    const unlock = () => {
      if (playerRef.current) return;
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const player = createSfxPlayer(new Ctor());
      playerRef.current = player;
      void player.resume();
    };

    // Returning from another tab suspends the context on some browsers.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void playerRef.current?.resume();
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const play = useCallback(
    (name: SfxName) => {
      if (muted) return;
      playerRef.current?.play(name);
    },
    [muted],
  );

  const value = useMemo<AudioApi>(
    () => ({ play, muted, setMuted: muteStore.set }),
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
    }
  );
}
