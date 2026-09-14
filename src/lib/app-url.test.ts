import { describe, expect, it } from "vitest";
import { baseUrlFrom } from "./app-url";

describe("baseUrlFrom", () => {
  it("uses APP_URL when it is configured", () => {
    expect(baseUrlFrom("https://box.example.com", "http", "localhost:3000")).toBe(
      "https://box.example.com",
    );
  });

  it("tolerates the trailing slash somebody will paste into Vercel", () => {
    expect(baseUrlFrom("https://box.example.com/", null, null)).toBe(
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
    expect(baseUrlFrom("   ", null, null)).toBe("");
  });
});
