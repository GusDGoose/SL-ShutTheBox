import { describe, expect, it } from "vitest";
import {
  FIRST_QUALITY,
  PHOTO_TARGET_BYTES,
  fitWithin,
  nextQuality,
} from "./photo-resize";

describe("fitWithin", () => {
  it("scales the long edge down to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("never scales up", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("rounds to whole pixels", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1601, 1000, 1600)).toEqual({ width: 1600, height: 999 });
  });
});

// [concept: quality stepping] Encode at 0.82; if the result is still over the
// target, step down by 0.08 and try again, stopping before the image turns to
// mush. The pure decision lives here so the canvas plumbing has nothing to get
// wrong about it.
describe("nextQuality", () => {
  it("starts at the first quality", () => {
    expect(FIRST_QUALITY).toBe(0.82);
  });

  it("keeps the quality when the encoded size is under the target", () => {
    expect(nextQuality(0.82, PHOTO_TARGET_BYTES - 1)).toBeNull();
  });

  it("steps down by 0.08 while over the target", () => {
    expect(nextQuality(0.82, PHOTO_TARGET_BYTES + 1)).toBeCloseTo(0.74, 5);
    expect(nextQuality(0.74, PHOTO_TARGET_BYTES + 1)).toBeCloseTo(0.66, 5);
  });

  it("gives up rather than go below 0.5", () => {
    expect(nextQuality(0.5, PHOTO_TARGET_BYTES + 1)).toBeNull();
    expect(nextQuality(0.55, PHOTO_TARGET_BYTES + 1)).toBeNull();
  });
});
