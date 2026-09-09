"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FIRST_QUALITY,
  PHOTO_LONG_EDGE,
  fitWithin,
  nextQuality,
} from "@/lib/photo-resize";
import {
  clearGamePhoto,
  uploadGamePhoto,
} from "@/app/(focus)/game/[id]/edit/actions";

/**
 * Shrinks a phone photo in the browser before it goes anywhere.
 *
 * A modern phone produces 4 MB; the bucket takes 1.5 MiB and the target is
 * about one. Long edge to 1600px, then JPEG at 0.82, stepping down while it is
 * still over the target — the stepping decision itself is in photo-resize.ts,
 * where it is unit-tested; this is only the canvas plumbing around it.
 */
async function shrink(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That photo could not be read — try a JPEG.");
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_LONG_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality: number | null = FIRST_QUALITY;
  let blob: Blob | null = null;
  while (quality !== null) {
    const q = quality;
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", q),
    );
    if (!blob) throw new Error("That photo could not be encoded.");
    quality = nextQuality(q, blob.size);
  }
  return new File([blob!], "photo.jpg", { type: "image/jpeg" });
}

/**
 * The photo of the day on a finished game: a print if there is one, a camera
 * button if not. Adding or removing needs a named player — the change goes in
 * the audit trail — so without one the control becomes a link to pick a name
 * rather than a button that refuses.
 */
export function GamePhoto({
  gameId,
  version,
  pinnedBy,
  knowsWho,
}: {
  gameId: string;
  /** Changes whenever the photo does, so the browser refetches the redirect. */
  version: string | null;
  pinnedBy: string | null;
  knowsWho: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const small = await shrink(file);
        const fd = new FormData();
        fd.append("photo", small);
        const res = await uploadGamePhoto(gameId, fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That photo didn't stick — try again?");
      }
    });
  }

  function remove() {
    setConfirming(false);
    startTransition(async () => {
      const res = await clearGamePhoto(gameId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (version) {
    return (
      <figure className="flex flex-col items-start gap-2">
        <div className="relative -rotate-1 rounded-sm bg-ivory p-2 pb-8 shadow-[var(--shadow-card)]">
          {/* A strip of tape, for the pinboard. */}
          <span
            aria-hidden
            className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 rotate-2 bg-brass/40"
          />
          {/* Plain <img>: the route redirects to a short-lived signed URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photo/${gameId}?v=${encodeURIComponent(version)}`}
            alt="The photo of the day"
            className="max-h-96 w-auto max-w-full rounded-[2px] object-contain"
          />
          {pinnedBy && (
            <figcaption className="absolute bottom-2 left-0 right-0 text-center font-[family-name:var(--font-display)] text-xs text-ink-muted">
              pinned up by {pinnedBy}
            </figcaption>
          )}
        </div>
        {knowsWho && (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-danger disabled:opacity-50"
            >
              <Trash2 aria-hidden size={14} /> Take the photo down
            </button>
            <ConfirmDialog
              open={confirming}
              title="Take the photo down?"
              body="It comes off the game and the scrapbook. You can add another."
              confirmLabel="Take it down"
              danger
              onConfirm={remove}
              onCancel={() => setConfirming(false)}
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </figure>
    );
  }

  if (!knowsWho) {
    return (
      <Link
        href={`/whoami?next=${encodeURIComponent(`/game/${gameId}`)}`}
        className={`${buttonClass("ghost")} self-start`}
      >
        <Camera aria-hidden size={18} /> Say who you are to add a photo
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        <Camera aria-hidden size={18} />
        {pending ? "Pinning it up…" : "Add today's photo"}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
