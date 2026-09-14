import { describe, expect, it } from "vitest";
import { isPublicPath, safeNext } from "./next-param";

describe("safeNext", () => {
  it("keeps a same-site path", () => {
    expect(safeNext("/stats")).toBe("/stats");
    expect(safeNext("/t/FKA429")).toBe("/t/FKA429");
  });

  it("collapses the double slash a mis-pasted APP_URL produced", () => {
    // What the QR codes on 2026-09-14 actually carried after decoding.
    expect(safeNext("//t/MF4TZU")).toBe("/t/MF4TZU");
    expect(safeNext("///t/MF4TZU")).toBe("/t/MF4TZU");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("evil.example/t/x")).toBe("/");
    // A collapsed "//evil.example" is a harmless relative path, not a host.
    expect(safeNext("//evil.example")).toBe("/evil.example");
  });

  it("defaults to Today", () => {
    expect(safeNext("")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});

describe("isPublicPath", () => {
  it("knows an event and its boards need no PIN", () => {
    expect(isPublicPath("/t/FKA429")).toBe(true);
    expect(isPublicPath("/t/fka429")).toBe(true);
    expect(isPublicPath("/t/FKA429/team/8f2c")).toBe(true);
  });

  it("but /t/new does — it asks for a session itself, and would loop", () => {
    // The regression the first version had: /t/new is under /t/ yet gated,
    // so sending somebody there from the PIN page sent them straight back.
    expect(isPublicPath("/t/new")).toBe(false);
    expect(isPublicPath("/t")).toBe(false);
  });

  it("and that everything else does, including lookalikes", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/stats")).toBe(false);
    expect(isPublicPath("/tea")).toBe(false);
    expect(isPublicPath("/tournament")).toBe(false);
  });
});
