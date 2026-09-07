"use client";

import { useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import {
  createClipPlayer,
  loadYouTubeApi,
  type Clip,
} from "@/lib/audio/youtube-api";

/** How much of a song a walk-up gets, when no end is set. */
const WALK_UP_SECONDS = 10;

/**
 * A few seconds of the player's own song as their turn begins.
 *
 * Remounted per turn via a key, so each player gets their own entrance. The
 * page has had a user gesture by this point — somebody tapped End turn — which
 * is what lets it make a sound at all.
 */
export function WalkUpPlayer({
  clip,
  playerName,
  muted,
}: {
  clip: Clip;
  playerName: string;
  muted: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (muted) return;
    let cancelled = false;

    void (async () => {
      let YT;
      try {
        YT = await loadYouTubeApi();
      } catch {
        return; // no walk-up is not worth surfacing an error for
      }
      if (cancelled || !host.current) return;

      // A walk-up is a taste, not the whole song: cap it unless the player has
      // set a shorter end of their own.
      const capped: Clip = {
        ...clip,
        endSeconds: Math.min(
          clip.endSeconds ?? Number.POSITIVE_INFINITY,
          clip.startSeconds + WALK_UP_SECONDS,
        ),
        loop: false,
        fadeMs: Math.min(clip.fadeMs, 600),
      };

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
          throttled by the browser and never starts. */}
      <div ref={host} className="size-1 overflow-hidden opacity-0" />
    </div>
  );
}
