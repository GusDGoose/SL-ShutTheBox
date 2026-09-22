import { describe, expect, it } from "vitest";
import {
  digestBlocks,
  fikaBlocks,
  fikaLine,
  prematchBlocks,
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
    expect(said(fikaLine(FIKA))).toContain("🐙 Ben bjuder på fika");
  });
});

describe("winnerBlocks", () => {
  it("posts nothing at all for a game with no winner", () => {
    expect(winnerBlocks([], FIKA)).toEqual([]);
  });

  it("announces a single winner and their score", () => {
    const out = said(winnerBlocks([winner()], null));
    expect(out).toContain("🦊 Alice vann dagens");
    expect(out).toContain("Vinnande poäng: 7");
  });

  it("says a tie is shared rather than won", () => {
    const out = said(
      winnerBlocks([winner(), winner({ name: "Ben", emoji: "🐙" })], null),
    );
    expect(out).toContain("🦊 Alice & 🐙 Ben delar på dagens seger");
    expect(out).not.toContain("vann dagens");
  });

  it("shouts about a shut box", () => {
    expect(said(winnerBlocks([winner({ score: 0, shutBox: true })], null)))
      .toContain("📦 LÅDAN STÄNGDES!");
  });

  it("mentions a streak only once it is worth mentioning", () => {
    // A streak of 1 is "won today", which the heading already said.
    expect(said(winnerBlocks([winner({ streak: 1 })], null))).not.toContain("🔥");
    expect(said(winnerBlocks([winner({ streak: 2 })], null))).toContain(
      "🔥 2 dagar i rad",
    );
  });

  it("carries the fika reminder, which is the point of the daily card", () => {
    expect(said(winnerBlocks([winner()], FIKA))).toContain("🐙 Ben bjuder på fika");
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
    expect(out).toContain("Inte ett enda spel");
    expect(out).not.toContain("🏆");
    // Even in a dead week the fika reminder still has to go out.
    expect(out).toContain("bjuder på fika");
  });

  it("reports the week", () => {
    const out = said(digestBlocks(base, null));
    expect(out).toContain("5 spel spelade.");
    expect(out).toContain("🏆 🦊 Alice vann veckan med 3 dagar");
    expect(out).toContain("🔥 🐙 Ben är uppe i 4 dagar i rad");
    expect(out).toContain("+19 i rating");
    expect(out).toContain("🏅 🦊 Alice tog utmärkelsen Shut the box");
  });

  it("gets the singular right for a one-game week", () => {
    expect(
      said(digestBlocks({ ...base, gamesPlayed: 1, champion: { ...base.champion, days: 1 } }, null)),
    ).toContain("1 spel spelat.");
  });

  it("leaves out a climber who did not climb", () => {
    const out = said(
      digestBlocks({ ...base, topGainer: { name: "Cleo", emoji: "🦄", delta: -4 } }, null),
    );
    expect(out).not.toContain("Störst klättring");
  });

  it("does not call a one-day streak a streak", () => {
    const out = said(
      digestBlocks({ ...base, longestStreak: { name: "Ben", emoji: "🐙", days: 1 } }, null),
    );
    expect(out).not.toContain("dagar i rad");
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

describe("prematchBlocks", () => {
  it("says a match is about to start, and reminds about the fika", () => {
    const out = said(prematchBlocks(FIKA));
    expect(out).toContain("Snart match");
    expect(out).toContain("12:45");
    expect(out).toContain("🐙 Ben bjuder på fika");
  });

  it("does not promise an exact countdown it cannot keep", () => {
    // A card that says "om 5 minuter" is wrong the moment a run is late.
    expect(said(prematchBlocks(null))).not.toMatch(/om \d+ minuter/);
  });
});

describe("fikaBlocks", () => {
  it("shows its working for a normal draw", () => {
    const out = said(
      fikaBlocks({
        name: "Ben",
        emoji: "🐙",
        reason: "worst_last_week",
        avgFinish: 4.5,
        games: 2,
      }),
    );
    expect(out).toContain("🐙 Ben bjuder på fika denna vecka");
    // The real average finishing place, with a Swedish decimal comma. The
    // normalised 0–1 "badness" the draw ranks by is NOT shown: "snittplacering
    // 1,00" read as "came first", the week Per-Erik came last twice.
    expect(out).toContain("snittplacering 4,5 på 2 spel");
    expect(out).not.toMatch(/[01],\d\d/);
  });

  it("keeps a whole number honest and singular", () => {
    const out = said(
      fikaBlocks({
        name: "Ben",
        emoji: "🐙",
        reason: "worst_last_week",
        avgFinish: 3,
        games: 1,
      }),
    );
    expect(out).toContain("snittplacering 3,0 på 1 spel");
  });

  it("leaves the number out when a draw predates it", () => {
    // Duties drawn before 0022 have no avg_finish in their detail.
    const out = said(
      fikaBlocks({
        name: "Ben",
        emoji: "🐙",
        reason: "worst_last_week",
        avgFinish: null,
        games: 2,
      }),
    );
    expect(out).toContain("Sämst förra veckan på 2 spel.");
    expect(out).not.toContain("snittplacering");
  });

  it("is honest when the draw was random", () => {
    expect(
      said(fikaBlocks({ name: "Ben", emoji: "🐙", reason: "random_fallback" })),
    ).toContain("lotten fick avgöra");
  });
});
