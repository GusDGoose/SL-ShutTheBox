import { describe, expect, it } from "vitest";
import { readPlayerPrefill } from "./player-prefill";

describe("readPlayerPrefill", () => {
  it("reads name and emoji from the welcome link", () => {
    expect(readPlayerPrefill({ name: "Ada Lovelace", emoji: "🧪" })).toEqual({
      name: "Ada Lovelace",
      emoji: "🧪",
    });
  });

  it("is empty when the link carries nothing", () => {
    expect(readPlayerPrefill({})).toEqual({ name: "", emoji: "" });
    expect(readPlayerPrefill({ add: "" })).toEqual({ name: "", emoji: "" });
  });

  it("trims, and takes the first of a repeated parameter", () => {
    expect(readPlayerPrefill({ name: ["  Ada ", "Bob"], emoji: " 🎲 " })).toEqual({
      name: "Ada",
      emoji: "🎲",
    });
  });

  it("clips absurd lengths instead of filling the box with them", () => {
    const { name, emoji } = readPlayerPrefill({ name: "x".repeat(500), emoji: "y".repeat(50) });
    expect(name).toHaveLength(60);
    expect(emoji).toHaveLength(16);
  });
});
