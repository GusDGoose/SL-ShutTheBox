"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  createClipPlayer,
  loadYouTubeApi,
  mixVolume,
  type Clip,
} from "@/lib/audio/youtube-api";

export type Anthem = {
  playerId: string;
  name: string;
  emoji: string;
  clip: Clip | null;
  songUrl: string | null;
};

/**
 * The winners' anthems — all of them, at the same time.
 *
 * [concept: the tie is the feature] A shared win plays every winner's song
 * simultaneously. That started as a bug in v1 (one autoplaying iframe per
 * winner) and the office decided it was the best part of the game, so it is
 * deliberate now: volumes are mixed, they start together, and one button stops
 * the lot. Do not turn this into a queue.
 */
export function AnthemStage({ anthems }: { anthems: Anthem[] }) {
  const hosts = useRef<Map<string, HTMLDivElement>>(new Map());
  const stoppers = useRef<(() => void)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);

  const withSongs = anthems.filter((a) => a.clip !== null);
  const withoutSongs = anthems.filter((a) => a.clip === null);

  useEffect(() => {
    let cancelled = false;
    if (withSongs.length === 0) return;

    // The volume each anthem gets so a three-way tie is chaos rather than mush.
    const volume = mixVolume(withSongs.length);

    void (async () => {
      let YT;
      try {
        YT = await loadYouTubeApi();
      } catch {
        if (!cancelled) setFailed(withSongs.map((a) => a.playerId));
        return;
      }
      if (cancelled) return;

      for (const anthem of withSongs) {
        const host = hosts.current.get(anthem.playerId);
        if (!host || !anthem.clip) continue;

        const clip = anthem.clip;
        new YT.Player(host, {
          videoId: clip.videoId,
          // Nocookie keeps YouTube from setting an advertising cookie on a
          // colleague's browser just because they won.
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            playsinline: 1,
            start: Math.floor(clip.startSeconds),
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const controller = createClipPlayer(event.target, clip, volume);
              stoppers.current.push(() => controller.stop());
              controller.start();
              setPlaying(true);
            },
            // 101 and 150 mean the owner disallowed embedding, which is common
            // enough that it needs a graceful answer rather than silence.
            onError: () => {
              if (!cancelled) {
                setFailed((prev) => [...prev, anthem.playerId]);
              }
            },
          },
        });
      }
    })();

    return () => {
      cancelled = true;
      stoppers.current.forEach((stop) => stop());
      stoppers.current = [];
    };
    // Deliberately once per mount: this component is mounted BY the crown tap,
    // and re-running would restart everyone's song mid-chorus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAll() {
    stoppers.current.forEach((stop) => stop());
    stoppers.current = [];
    setPlaying(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {withSongs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold">
            {withSongs.length === 1
              ? `♪ ${withSongs[0]!.emoji} ${withSongs[0]!.name}'s anthem`
              : `♪ ${withSongs.length} anthems at once — ${withSongs
                  .map((a) => a.name)
                  .join(" and ")}`}
          </p>
          {playing && (
            <Button variant="secondary" onClick={stopAll}>
              Stop {withSongs.length > 1 ? "all" : ""}
            </Button>
          )}
        </div>
      )}

      {/* The players themselves. Audio is the point, so they are kept small
          rather than hidden — a zero-size iframe gets throttled. */}
      <div className="flex flex-wrap gap-2">
        {withSongs.map((anthem) => (
          <div key={anthem.playerId} className="w-40">
            <div
              ref={(node) => {
                if (node) hosts.current.set(anthem.playerId, node);
              }}
              className="aspect-video w-full overflow-hidden rounded-[var(--radius-control)] bg-black/20"
            />
            {failed.includes(anthem.playerId) && anthem.songUrl && (
              <a
                href={anthem.songUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-ink-muted underline"
              >
                Won&apos;t play here — open on YouTube ↗
              </a>
            )}
          </div>
        ))}
      </div>

      {withoutSongs.map((anthem) => (
        <p key={anthem.playerId} className="text-sm text-ink-muted">
          {anthem.emoji} {anthem.name} has no victory song yet —{" "}
          <Link href="/players" className="font-semibold underline">
            set one for next time
          </Link>
          .
        </p>
      ))}
    </div>
  );
}
