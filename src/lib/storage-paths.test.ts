import { describe, expect, it } from "vitest";
import {
  CLIP_MAX_BYTES,
  PHOTO_MAX_BYTES,
  checkUpload,
  clipObjectPath,
  extensionFor,
  photoObjectPath,
} from "./storage-paths";

const GAME = "0237a4b0-4d54-4d5a-a4bc-1e5b222f6423";
const PLAYER = "66841dfa-eeab-4e8f-9ef0-8ffb4e14c84c";

describe("extensionFor", () => {
  it("maps the accepted MIME types to file extensions", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("audio/mpeg")).toBe("mp3");
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/ogg")).toBe("ogg");
  });

  it("refuses anything else rather than guessing", () => {
    expect(extensionFor("image/gif")).toBeNull();
    expect(extensionFor("application/pdf")).toBeNull();
    expect(extensionFor("")).toBeNull();
  });
});

describe("object paths", () => {
  // Year/month folders keep the bucket browsable in the dashboard and mean a
  // month's photos can be listed without scanning everything.
  it("files a photo under the month it was played, named by the game", () => {
    expect(photoObjectPath("2026-09-08", GAME, "image/jpeg")).toBe(
      `2026/09/${GAME}.jpg`,
    );
  });

  it("names a clip by its player, so re-uploading replaces rather than piles up", () => {
    expect(clipObjectPath(PLAYER, "audio/mpeg")).toBe(`${PLAYER}.mp3`);
  });
});

describe("checkUpload", () => {
  it("accepts a phone photo that has been resized", () => {
    expect(checkUpload("photo", { type: "image/jpeg", size: 900_000 })).toBeNull();
  });

  it("names the accepted formats when refusing a photo type", () => {
    expect(checkUpload("photo", { type: "image/gif", size: 10 })).toMatch(
      /JPEG, WebP or PNG/,
    );
  });

  // The browser resizes to about a megabyte; this is the backstop for a
  // client that did not, well under the bucket's own 1.5 MiB cap.
  it("refuses a photo that is still too big", () => {
    expect(
      checkUpload("photo", { type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 }),
    ).toMatch(/too big/i);
  });

  it("accepts an MP3 clip and refuses one over the limit", () => {
    expect(checkUpload("clip", { type: "audio/mpeg", size: 3_000_000 })).toBeNull();
    expect(
      checkUpload("clip", { type: "audio/mpeg", size: CLIP_MAX_BYTES + 1 }),
    ).toMatch(/too big/i);
  });

  it("refuses a photo where a clip was expected, and the reverse", () => {
    expect(checkUpload("clip", { type: "image/jpeg", size: 10 })).toMatch(/MP3/);
    expect(checkUpload("photo", { type: "audio/mpeg", size: 10 })).toMatch(
      /JPEG, WebP or PNG/,
    );
  });
});
