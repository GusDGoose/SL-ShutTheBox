"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSfx } from "@/components/ui/audio-provider";
import type { ClipSource } from "@/lib/audio/clip-source";
import { createFileClipPlayer } from "@/lib/audio/file-clip-player";
import {
  createClipPlayer,
  loadYouTubeApi,
  mixVolume,
} from "@/lib/audio/youtube-api";

export type Anthem = {
  playerId: string;
  name: string;
  emoji: string;
  clip: ClipSource | null;
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
 *
 * Two kinds of clip share the stage. An uploaded file plays through Web Audio
 * on the context the first tap unlocked — exact trim, real fades, works on an
 * iPhone. A YouTube clip plays in a small embed, because that is the only way
 * YouTube allows.
 */
export function AnthemStage({ anthems }: { anthems: Anthem[] }) {
  const hosts = useRef<Map<string, HTMLDivElement>>(new Map());
  const stoppers = useRef<(() => void)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const { audioContext } = useSfx();

  const withSongs = anthems.filter((a) => a.clip !== null);
  const withoutSongs = anthems.filter((a) => a.clip === null);
  const files = withSongs.filter((a) => a.clip!.kind === "file");
  const embeds = withSongs.filter((a) => a.clip!.kind === "youtube");

  useEffect(() => {
    let cancelled = false;
    if (withSongs.length === 0) return;

    // The volume each anthem gets so a three-way tie is chaos rather than mush.
    const volume = mixVolume(withSongs.length);

    // Uploaded clips first: they need no network round-trip to a third party
    // and start within the same gesture as the crown.
    if (files.length > 0) {
      const ctx = audioContext() ?? new AudioContext();
      for (const anthem of files) {
        const clip = anthem.clip as Extract<ClipSource, { kind: "file" }>;
        const controller = createFileClipPlayer(ctx, clip.url, clip, volume);
        // "Playing" once the bytes have actually arrived, mirroring the
        // embed's onReady — a decode that fails should not light the button.
        controller.ready.then(
          () => {
            if (!cancelled) setPlaying(true);
          },
          () => {
            if (!cancelled) setFailed((prev) => [...prev, anthem.playerId]);
          },
        );
        stoppers.current.push(() => controller.stop());
        controller.start();
      }
    }

    if (embeds.length > 0) {
      void (async () => {
        let YT;
        try {
          YT = await loadYouTubeApi();
        } catch {
          if (!cancelled) {
            setFailed((prev) => [...prev, ...embeds.map((a) => a.playerId)]);
          }
          return;
        }
        if (cancelled) return;

        for (const anthem of embeds) {
          const host = hosts.current.get(anthem.playerId);
          const clip = anthem.clip as Extract<ClipSource, { kind: "youtube" }>;
          if (!host) continue;

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
              // 101 and 150 mean the owner disallowed embedding, which is
              // common enough that it needs a graceful answer, not silence.
              onError: () => {
                if (!cancelled) {
                  setFailed((prev) => [...prev, anthem.playerId]);
                }
              },
            },
          });
        }
      })();
    }

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

      <div className="flex flex-wrap gap-2">
        {/* Embeds are kept small rather than hidden: a zero-size iframe gets
            throttled. File clips need no box at all, just a name. */}
        {embeds.map((anthem) => (
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
        {files.map((anthem) => (
          <p
            key={anthem.playerId}
            className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted"
          >
            <span aria-hidden>{anthem.emoji}</span>{" "}
            {failed.includes(anthem.playerId)
              ? `${anthem.name}'s clip would not load`
              : `${anthem.name}'s own clip`}
          </p>
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
