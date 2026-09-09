"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSfx } from "@/components/ui/audio-provider";
import { createFileClipPlayer } from "@/lib/audio/file-clip-player";
import { formatTimestamp, parseTimestamp } from "@/lib/clip-time";
import type { Player } from "@/lib/types";
import { extractVideoId } from "@/lib/youtube";
import {
  clearSongClip,
  setSongClip,
  uploadSongClip,
} from "@/app/(shell)/players/actions";

/**
 * Which slice of a player's song plays, and from where.
 *
 * Times are typed as people say them — "1:30" — and stored as seconds. The
 * source is the YouTube URL on the player row unless an MP3 has been uploaded,
 * in which case the file wins: it can be trimmed and faded exactly, and it
 * fades on iPhones, where the embed cannot.
 */
export function SongClipEditor({ player }: { player: Player }) {
  const [start, setStart] = useState(formatTimestamp(player.song_start_seconds ?? 0));
  const [end, setEnd] = useState(
    player.song_end_seconds === null ? "" : formatTimestamp(player.song_end_seconds),
  );
  const [fade, setFade] = useState(String(player.song_fade_ms ?? 1500));
  const [loop, setLoop] = useState(player.song_loop ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewing, setPreviewing] = useState(false);
  const stopPreview = useRef<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { audioContext } = useSfx();

  const hasFile = Boolean(player.song_clip_path);
  const videoId = player.song_url ? extractVideoId(player.song_url) : null;
  const uid = player.id.slice(0, 8);

  function done(res: { ok: true } | { ok: false; error: string }) {
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  function save() {
    setError(null);
    const startSeconds = parseTimestamp(start);
    if (startSeconds === null) {
      setError("The start has to look like 1:30.");
      return;
    }
    let endSeconds: number | null = null;
    if (end.trim() !== "") {
      endSeconds = parseTimestamp(end);
      if (endSeconds === null) {
        setError("The end has to look like 2:00 — or leave it empty for the whole song.");
        return;
      }
      if (endSeconds <= startSeconds) {
        setError("The end has to come after the start.");
        return;
      }
    }
    const fadeMs = Number(fade);
    if (!Number.isInteger(fadeMs) || fadeMs < 0) {
      setError("The fade is in milliseconds — 1500 is a second and a half.");
      return;
    }
    startTransition(async () => {
      done(await setSongClip(player.id, { startSeconds, endSeconds, fadeMs, loop }));
    });
  }

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("clip", file);
      done(await uploadSongClip(player.id, fd));
    });
  }

  function dropFile() {
    setError(null);
    startTransition(async () => {
      done(await clearSongClip(player.id));
    });
  }

  // Preview plays what is SAVED, from the uploaded file, through the same
  // player the crowning uses — so what you hear here is what the table hears.
  function togglePreview() {
    if (previewing) {
      stopPreview.current?.();
      stopPreview.current = null;
      setPreviewing(false);
      return;
    }
    const ctx = audioContext() ?? new AudioContext();
    const controller = createFileClipPlayer(
      ctx,
      `/api/clip/${player.id}`,
      {
        startSeconds: player.song_start_seconds ?? 0,
        endSeconds: player.song_end_seconds,
        fadeMs: player.song_fade_ms ?? 1500,
        loop: player.song_loop ?? false,
      },
      80,
      () => setPreviewing(false),
    );
    controller.ready.catch(() => {
      setError("That clip would not load.");
      setPreviewing(false);
    });
    stopPreview.current = () => controller.stop();
    controller.start();
    setPreviewing(true);
  }

  const field =
    "w-20 rounded-[var(--radius-control)] border border-line bg-surface px-2 py-1.5 text-sm tabular-nums";

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line/60 bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="eyebrow">Anthem clip</span>
        {hasFile ? (
          <span className="text-ink-muted">
            Playing their own clip
            {videoId && " — the YouTube link is kept as a fallback"}
          </span>
        ) : videoId ? (
          <span className="text-ink-muted">From the YouTube link</span>
        ) : (
          <span className="text-ink-muted">No song yet — paste a YouTube link above, or upload an MP3</span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Start
          <input
            id={`start-${uid}`}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="1:30"
            inputMode="numeric"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          End
          <input
            id={`end-${uid}`}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="to the end"
            inputMode="numeric"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Fade (ms)
          <input
            id={`fade-${uid}`}
            value={fade}
            onChange={(e) => setFade(e.target.value)}
            inputMode="numeric"
            className={field}
          />
        </label>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className="size-4 accent-brass"
          />
          Repeat
        </label>
        <Button variant="secondary" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save clip"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          ref={fileInput}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/ogg,.mp3,.m4a,.ogg"
          aria-label="Upload an MP3 instead"
          className="sr-only"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-1 font-semibold text-ink-muted hover:text-ink disabled:opacity-50"
        >
          <Upload aria-hidden size={14} />
          {hasFile ? "Replace the MP3" : "Upload an MP3 instead"}
        </button>

        {hasFile && (
          <>
            <button
              type="button"
              onClick={togglePreview}
              className="flex items-center gap-1 font-semibold text-ink-muted hover:text-ink"
            >
              {previewing ? <Square aria-hidden size={14} /> : <Play aria-hidden size={14} />}
              {previewing ? "Stop" : "Preview"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={dropFile}
              className="font-semibold text-ink-muted hover:text-danger disabled:opacity-50"
            >
              Use the YouTube link instead
            </button>
          </>
        )}

        {!hasFile && videoId && (
          <a
            href={`https://youtu.be/${videoId}?t=${parseTimestamp(start) ?? 0}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink-muted underline hover:text-ink"
          >
            Open at {start || "0:00"} on YouTube ↗
          </a>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
