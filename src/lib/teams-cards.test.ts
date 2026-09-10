import { describe, expect, it } from "vitest";
import {
  digestBlocks,
  fikaBlocks,
  fikaLine,
  nudgeBlocks,
  winnerBlocks,
  type CardBlock,
  type Winner,
} from "./teams-cards";

const said = (blocks: CardBlock[]) => blocks.map((b) => String(b.text)).join("\n");

const winner = (over: Partial<Winner> = {}): Winner => ({
  name: "Alice",
  emoji: "🦊",
  score: 7,
  streak: 1,
  shutBox: false,
  ...over,
});

const FIKA = { name: "Ben", emoji: "🐙" };

describe("fikaLine", () => {
  it("says nothing when nobody has been drawn", () => {
    expect(fikaLine(null)).toEqual([]);
  });

  it("names the buyer", () => {
    expect(said(fikaLine(FIKA))).toContain("🐙 Ben buys fika");
  });
});

describe("winnerBlocks", () => {
  it("posts nothing at all for a game with no winner", () => {
    expect(winnerBlocks([], FIKA)).toEqual([]);
  });

  it("announces a single winner and their score", () => {
    const out = said(winnerBlocks([winner()], null));
    expect(out).toContain("🦊 Alice won today");
    expect(out).toContain("Winning score: 7");
  });

  it("says a tie is shared rather than won", () => {
    const out = said(
      winnerBlocks([winner(), winner({ name: "Ben", emoji: "🐙" })], null),
    );
    expect(out).toContain("🦊 Alice & 🐙 Ben share today");
    expect(out).not.toContain("won today");
  });

  it("shouts about a shut box", () => {
    expect(said(winnerBlocks([winner({ score: 0, shutBox: true })], null)))
      .toContain("📦 THE BOX WAS SHUT!");
  });

  it("mentions a streak only once it is worth mentioning", () => {
    // A streak of 1 is "won today", which the heading already said.
    expect(said(winnerBlocks([winner({ streak: 1 })], null))).not.toContain("🔥");
    expect(said(winnerBlocks([winner({ streak: 2 })], null))).toContain(
      "🔥 2 days running",
    );
  });

  it("carries the fika reminder, which is the point of the daily card", () => {
    expect(said(winnerBlocks([winner()], FIKA))).toContain("🐙 Ben buys fika");
    expect(said(winnerBlocks([winner()], null))).not.toContain("fika");
  });
});

describe("digestBlocks", () => {
  const base = {
    weekOf: "2026-09-07",
    champion: { name: "Alice", emoji: "🦊", days: 3 },
    longestStreak: { name: "Ben", emoji: "🐙", days: 4 },
    topGainer: { name: "Cleo", emoji: "🦄", delta: 18.6 },
    badges: [{ name: "Alice", emoji: "🦊", badge: "Shut the box" }],
    gamesPlayed: 5,
  };

  it("admits a quiet week instead of inventing a champion", () => {
    const out = said(
      digestBlocks({ ...base, gamesPlayed: 0, champion: null }, FIKA),
    );
    expect(out).toContain("Not a single game");
    expect(out).not.toContain("🏆");
    // Even in a dead week the fika reminder still has to go out.
    expect(out).toContain("buys fika");
  });

  it("reports the week", () => {
    const out = said(digestBlocks(base, null));
    expect(out).toContain("5 games played");
    expect(out).toContain("🏆 🦊 Alice won the week with 3 days");
    expect(out).toContain("🔥 🐙 Ben is on 4 days running");
    expect(out).toContain("+19 rating");
    expect(out).toContain("🏅 🦊 Alice earned Shut the box");
  });

  it("gets the singular right for a one-game week", () => {
    expect(
      said(digestBlocks({ ...base, gamesPlayed: 1, champion: { ...base.champion, days: 1 } }, null)),
    ).toContain("1 game played");
  });

  it("leaves out a climber who did not climb", () => {
    const out = said(
      digestBlocks({ ...base, topGainer: { name: "Cleo", emoji: "🦄", delta: -4 } }, null),
    );
    expect(out).not.toContain("Biggest climber");
  });

  it("does not call a one-day streak a streak", () => {
    const out = said(
      digestBlocks({ ...base, longestStreak: { name: "Ben", emoji: "🐙", days: 1 } }, null),
    );
    expect(out).not.toContain("days running");
  });

  it("caps the badge roll so one big week cannot flood the channel", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      name: `P${i}`,
      emoji: "🎲",
      badge: "Regular",
    }));
    const out = said(digestBlocks({ ...base, badges: many }, null));
    expect(out.match(/🏅/g)).toHaveLength(5);
  });
});

describe("nudgeBlocks", () => {
  it("asks for a game and reminds about the fika", () => {
    const out = said(nudgeBlocks(FIKA));
    expect(out).toContain("No game yet today");
    expect(out).toContain("🐙 Ben buys fika");
  });
});

describe("fikaBlocks", () => {
  it("shows its working for a normal draw", () => {
    const out = said(
      fikaBlocks({
        name: "Ben",
        emoji: "🐙",
        reason: "worst_last_week",
        badness: 0.8333,
        games: 3,
      }),
    );
    expect(out).toContain("🐙 Ben buys fika this week");
    expect(out).toContain("average finish 0.83 over 3 games");
  });

  it("is honest when the draw was random", () => {
    expect(
      said(fikaBlocks({ name: "Ben", emoji: "🐙", reason: "random_fallback" })),
    ).toContain("drawn at random");
  });
});
