import { describe, expect, it } from "vitest";
import { extractVideoId, embedUrl } from "./youtube";

// [concept: unit tests / TDD] These were written BEFORE the implementation —
// they define the contract. `npm test` runs them via vitest.
describe("extractVideoId", () => {
  it("parses a standard watch URL", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("parses a short youtu.be link", () => {
    expect(extractVideoId("https://youtu.be/ZbZSe6N_BXs")).toBe("ZbZSe6N_BXs");
  });

  it("parses youtu.be with extra params (timestamps)", () => {
    expect(extractVideoId("https://youtu.be/ZbZSe6N_BXs?t=42")).toBe(
      "ZbZSe6N_BXs",
    );
  });

  it("parses shorts, embed and live paths", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/abcdefghijk")).toBe(
      "abcdefghijk",
    );
    expect(extractVideoId("https://www.youtube.com/embed/abcdefghijk")).toBe(
      "abcdefghijk",
    );
    expect(extractVideoId("https://www.youtube.com/live/abcdefghijk")).toBe(
      "abcdefghijk",
    );
  });

  it("parses watch URLs where v is not the first param", () => {
    expect(
      extractVideoId("https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("parses music.youtube.com and mobile hosts", () => {
    expect(
      extractVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("accepts ids with - and _", () => {
    expect(extractVideoId("https://youtu.be/a-b_c-d_e-f")).toBe("a-b_c-d_e-f");
  });

  it("tolerates missing protocol", () => {
    expect(extractVideoId("youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("rejects non-YouTube URLs", () => {
    expect(extractVideoId("https://vimeo.com/12345678")).toBeNull();
    expect(extractVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("rejects garbage and empty input", () => {
    expect(extractVideoId("not a url")).toBeNull();
    expect(extractVideoId("")).toBeNull();
    expect(extractVideoId("   ")).toBeNull();
  });

  it("rejects malformed ids (wrong length)", () => {
    expect(extractVideoId("https://youtu.be/tooShort")).toBeNull();
  });
});

describe("embedUrl", () => {
  it("builds a privacy-enhanced autoplay embed URL", () => {
    expect(embedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1",
    );
  });
});
