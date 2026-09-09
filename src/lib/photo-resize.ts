/**
 * The decisions behind shrinking a phone photo before upload. Pure, so they
 * are unit-tested; the canvas work that applies them lives in the uploader,
 * where jsdom cannot follow.
 */

/** Long edge after resizing. Plenty for a phone screen and a scrapbook. */
export const PHOTO_LONG_EDGE = 1600;
/** What the encoder aims for. The bucket allows 1.5 MiB; this is the target. */
export const PHOTO_TARGET_BYTES = 1024 * 1024;
/** JPEG quality on the first attempt. */
export const FIRST_QUALITY = 0.82;

const QUALITY_STEP = 0.08;
const QUALITY_FLOOR = 0.5;

/** Dimensions with the long edge at most `max`, aspect ratio kept, never upscaled. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * [concept: quality stepping] Given the quality just used and the size it
 * produced, the quality to try next — or null to stop, either because the
 * photo already fits or because going lower would turn it to mush. The caller
 * tells the two apart by checking the size against PHOTO_TARGET_BYTES.
 */
export function nextQuality(current: number, encodedBytes: number): number | null {
  if (encodedBytes <= PHOTO_TARGET_BYTES) return null;
  const next = Math.round((current - QUALITY_STEP) * 100) / 100;
  return next < QUALITY_FLOOR ? null : next;
}
