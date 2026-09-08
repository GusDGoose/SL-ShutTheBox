/**
 * Where uploads live in Storage, and what we accept.
 *
 * Pure, so the rules are unit-tested; the actions and routes that move bytes
 * call these and add nothing of their own. The bucket-level limits in
 * migration 0015 are the backstop — these are the numbers a person sees.
 */

/** A phone photo after the browser has resized it; ~1 MB is the target. */
export const PHOTO_MAX_BYTES = Math.round(1.2 * 1024 * 1024);
/** Thirty seconds of decent MP3 is well under this. */
export const CLIP_MAX_BYTES = 4 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

const PHOTO_TYPES = new Set(["image/jpeg", "image/webp", "image/png"]);
const CLIP_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/ogg"]);

/** The file extension for an accepted MIME type, or null for anything else. */
export function extensionFor(mime: string): string | null {
  return EXTENSIONS[mime] ?? null;
}

function requireExtension(mime: string): string {
  const ext = extensionFor(mime);
  if (!ext) throw new Error(`unsupported upload type: ${mime || "(none)"}`);
  return ext;
}

/**
 * `YYYY/MM/<gameId>.<ext>` — filed under the month it was played, so a month's
 * photos can be listed without scanning the bucket, and named by the game so
 * re-uploading replaces rather than accumulates.
 */
export function photoObjectPath(
  playedOn: string,
  gameId: string,
  mime: string,
): string {
  const [year, month] = playedOn.split("-");
  return `${year}/${month}/${gameId}.${requireExtension(mime)}`;
}

/** `<playerId>.<ext>` — one clip per player; a new upload replaces the old. */
export function clipObjectPath(playerId: string, mime: string): string {
  return `${playerId}.${requireExtension(mime)}`;
}

export type UploadKind = "photo" | "clip";

/**
 * Why an upload cannot be accepted, or null if it can. Phrased for the person
 * holding the phone, not for a log.
 */
export function checkUpload(
  kind: UploadKind,
  file: { type: string; size: number },
): string | null {
  if (kind === "photo") {
    if (!PHOTO_TYPES.has(file.type)) {
      return "That is not a photo we can take — JPEG, WebP or PNG, please.";
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return "That photo is too big (over 1.2 MB). Try again — the app should have shrunk it first.";
    }
    return null;
  }
  if (!CLIP_TYPES.has(file.type)) {
    return "That is not an audio clip we can play — MP3, M4A or OGG.";
  }
  if (file.size > CLIP_MAX_BYTES) {
    return "That clip is too big (over 4 MB). Trim it to the part you actually want.";
  }
  return null;
}
