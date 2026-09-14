import { describe, expect, it } from "vitest";
import { appOrigin, baseUrlFrom } from "./app-url";

describe("appOrigin", () => {
  it("keeps only the scheme and host", () => {
    expect(appOrigin("https://box.example.com")).toBe("https://box.example.com");
  });

  it("discards a path and query pasted in from an address bar", () => {
    // The value production actually carried for a month: the PIN page's URL.
    expect(appOrigin("https://box.example.com/pin?next=%2F")).toBe(
      "https://box.example.com",
    );
    expect(appOrigin("https://box.example.com/")).toBe("https://box.example.com");
  });

  it("keeps a port, which is what a local host needs", () => {
    expect(appOrigin("http://127.0.0.1:3000/anything")).toBe("http://127.0.0.1:3000");
  });

  it("treats junk as unset rather than building a broken link from it", () => {
    expect(appOrigin("")).toBeNull();
    expect(appOrigin("   ")).toBeNull();
    expect(appOrigin("not a url")).toBeNull();
    expect(appOrigin(undefined)).toBeNull();
  });
});

describe("baseUrlFrom", () => {
  it("uses APP_URL when it is configured", () => {
    expect(baseUrlFrom("https://box.example.com", "http", "localhost:3000")).toBe(
      "https://box.example.com",
    );
  });

  it("falls back to the request, which is what local development has", () => {
    expect(baseUrlFrom(undefined, "http", "127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("assumes https when nothing forwarded a protocol", () => {
    expect(baseUrlFrom("", null, "box.example.com")).toBe("https://box.example.com");
  });

  it("returns nothing rather than a broken URL when the host is unknown", () => {
    // The caller falls back to a relative link; only the QR code is lost.
    expect(baseUrlFrom(undefined, null, null)).toBe("");
    expect(baseUrlFrom("not a url", null, null)).toBe("");
  });
});
