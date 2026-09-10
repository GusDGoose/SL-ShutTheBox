import { describe, expect, it } from "vitest";
import { formatTimestamp, parseTimestamp } from "./clip-time";

// Players type "1:30" and "2:00", not 90 and 120. The database stores seconds.
describe("parseTimestamp", () => {
  it("reads m:ss", () => {
    expect(parseTimestamp("1:30")).toBe(90);
    expect(parseTimestamp("2:00")).toBe(120);
    expect(parseTimestamp("0:05")).toBe(5);
  });

  it("reads h:mm:ss for the ambitious", () => {
    expect(parseTimestamp("1:02:03")).toBe(3723);
  });

  it("reads bare seconds too, since that is what the field used to be", () => {
    expect(parseTimestamp("90")).toBe(90);
  });

  it("shrugs off whitespace", () => {
    expect(parseTimestamp(" 1:30 ")).toBe(90);
  });

  it("returns null for anything it cannot make sense of, rather than 0", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("a:b")).toBeNull();
    expect(parseTimestamp("-5")).toBeNull();
    expect(parseTimestamp("1:30:00:00")).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("writes m:ss with a padded seconds field", () => {
    expect(formatTimestamp(90)).toBe("1:30");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(600)).toBe("10:00");
  });

  it("round-trips what parseTimestamp reads", () => {
    for (const s of ["0:00", "1:30", "2:00", "12:34"]) {
      expect(formatTimestamp(parseTimestamp(s)!)).toBe(s);
    }
  });
});

describe("parseTimestamp — separators people actually type", () => {
  it("reads a full stop or comma as a colon", () => {
    // The numeric keypad on a phone offers "." (or "," on a Swedish layout)
    // and no colon at all, which is how this bug was found.
    expect(parseTimestamp("1.30")).toBe(90);
    expect(parseTimestamp("1,30")).toBe(90);
    expect(parseTimestamp("1.02.03")).toBe(3723);
  });

  it("still rejects a nonsense seconds field however it was typed", () => {
    expect(parseTimestamp("1.75")).toBeNull();
    expect(parseTimestamp("1:75")).toBeNull();
  });

  it("leaves plain seconds meaning plain seconds", () => {
    // "130" must NOT become 1:30 — it has always meant 130 seconds, and
    // silently changing that would move every clip already saved.
    expect(parseTimestamp("130")).toBe(130);
  });
});
