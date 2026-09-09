"use client";

import { useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { useSfx } from "@/components/ui/audio-provider";
import { walkUpOf, type ClipSource } from "@/lib/audio/clip-source";
import { createFileClipPlayer } from "@/lib/audio/file-clip-player";
import { createClipPlayer, loadYouTubeApi } from "@/lib/audio/youtube-api";

/**
 * A few seconds of the player's own song as their turn begins.
 *
 * Remounted per turn via a key, so each player gets their own entrance. The
 * page has had a user gesture by this point — somebody tapped End turn — which
 * is what lets it make a sound at all. An uploaded clip plays through Web
 * Audio on the context that gesture unlocked; a YouTube clip through a
 * whisper-sized embed.
 */
export function WalkUpPlayer({
  clip,
  playerName,
  muted,
}: {
  clip: ClipSource;
  playerName: string;
  muted: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const [done, setDone] = useState(false);
  const { audioContext } = useSfx();

  useEffect(() => {
    if (muted) return;
    let cancelled = false;
    // A walk-up is a taste, not the whole song.
    const capped = walkUpOf(clip);

    if (capped.kind === "file") {
      const ctx = audioContext() ?? new AudioContext();
      const controller = createFileClipPlayer(ctx, capped.url, capped, 70, () => {
        if (!cancelled) setDone(true);
      });
      controller.ready.catch(() => {
        if (!cancelled) setDone(true); // no walk-up is not worth an error
      });
      stop.current = () => {
        controller.stop();
        setDone(true);
      };
      controller.start();
      return () => {
        cancelled = true;
        controller.stop();
      };
    }

    void (async () => {
      let YT;
      try {
        YT = await loadYouTubeApi();
      } catch {
        return; // no walk-up is not worth surfacing an error for
      }
      if (cancelled || !host.current) return;

      new YT.Player(host.current, {
        videoId: capped.videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          start: Math.floor(capped.startSeconds),
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            const controller = createClipPlayer(event.target, capped, 70);
            stop.current = () => {
              controller.stop();
              setDone(true);
            };
            controller.start();
            // Clear itself away once the taste is over.
            setTimeout(
              () => {
                if (!cancelled) setDone(true);
              },
              (capped.endSeconds! - capped.startSeconds) * 1000 + 400,
            );
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      stop.current?.();
    };
    // audioContext is a stable accessor; the clip and mute are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, muted]);

  if (muted || done) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <span aria-hidden>♪</span>
      <span>{playerName}&apos;s walk-up</span>
      <button
        type="button"
        onClick={() => stop.current?.()}
        className="flex items-center gap-1 font-semibold underline"
      >
        <SkipForward aria-hidden size={12} /> Skip
      </button>
      {/* Kept in the layout at a whisper of a size: a zero-size player gets
          throttled by the browser and never starts. Unused for file clips. */}
      <div ref={host} className="size-1 overflow-hidden opacity-0" />
    </div>
  );
}
