/**
 * The Adaptive Card bodies, as pure functions.
 *
 * Split out of teams.ts on purpose: that module is `server-only` and does the
 * posting, which cannot be unit-tested without a webhook. The wording and the
 * arithmetic — plurals, the streak threshold, whether a line appears at all —
 * are the parts that get things wrong in front of the whole team, so they
 * live here where a test can read them.
 *
 * [concept: Adaptive Card] A Teams *Workflows* webhook takes a card, not
 * `{"text": ...}`. Blocks are plain objects; the envelope is built in teams.ts.
 */

export type CardBlock = Record<string, unknown>;

export type Winner = {
  name: string;
  emoji: string;
  score: number;
  streak: number;
  shutBox: boolean;
};

export type FikaLine = {
  name: string;
  emoji: string;
} | null;

const text = (t: string, extra: CardBlock = {}): CardBlock => ({
  type: "TextBlock",
  text: t,
  wrap: true,
  ...extra,
});

const heading = (t: string): CardBlock =>
  text(t, { size: "Large", weight: "Bolder" });

/** "☕ This week: 🦊 Alice buys fika" — appended to whatever card is going out. */
export function fikaLine(fika: FikaLine): CardBlock[] {
  if (!fika) return [];
  return [
    text(`☕ This week: ${fika.emoji} ${fika.name} buys fika`, {
      isSubtle: true,
      spacing: "Small",
    }),
  ];
}

/** The card posted the moment a game is crowned. */
export function winnerBlocks(winners: Winner[], fika: FikaLine): CardBlock[] {
  if (winners.length === 0) return [];

  const names = winners.map((w) => `${w.emoji} ${w.name}`).join(" & ");
  const score = winners[0]!.score;
  const shutBox = winners.some((w) => w.shutBox);
  const maxStreak = Math.max(...winners.map((w) => w.streak));

  const blocks: CardBlock[] = [
    heading(
      winners.length > 1
        ? `👑 ${names} share today's Shut the Box!`
        : `👑 ${names} won today's Shut the Box!`,
    ),
    text(
      shutBox
        ? `Winning score: ${score} — 📦 THE BOX WAS SHUT!`
        : `Winning score: ${score}`,
    ),
  ];
  // A streak of one is just "won today", which the heading already said.
  if (maxStreak >= 2) blocks.push(text(`🔥 ${maxStreak} days running`));
  return [...blocks, ...fikaLine(fika)];
}

export type Digest = {
  /** The Monday the week being summarised began. */
  weekOf: string;
  champion: { name: string; emoji: string; days: number } | null;
  longestStreak: { name: string; emoji: string; days: number } | null;
  topGainer: { name: string; emoji: string; delta: number } | null;
  badges: { name: string; emoji: string; badge: string }[];
  gamesPlayed: number;
};

/** Monday morning: how last week went. */
export function digestBlocks(d: Digest, fika: FikaLine): CardBlock[] {
  const blocks: CardBlock[] = [heading("🎲 Last week at the box")];

  if (d.gamesPlayed === 0) {
    blocks.push(text("Not a single game was played. The box is getting dusty."));
    return [...blocks, ...fikaLine(fika)];
  }

  blocks.push(
    text(`${d.gamesPlayed} game${d.gamesPlayed === 1 ? "" : "s"} played.`),
  );
  if (d.champion) {
    blocks.push(
      text(
        `🏆 ${d.champion.emoji} ${d.champion.name} won the week with ${d.champion.days} day${d.champion.days === 1 ? "" : "s"}.`,
      ),
    );
  }
  if (d.longestStreak && d.longestStreak.days >= 2) {
    blocks.push(
      text(
        `🔥 ${d.longestStreak.emoji} ${d.longestStreak.name} is on ${d.longestStreak.days} days running.`,
      ),
    );
  }
  if (d.topGainer && d.topGainer.delta > 0) {
    blocks.push(
      text(
        `📈 Biggest climber: ${d.topGainer.emoji} ${d.topGainer.name}, +${Math.round(d.topGainer.delta)} rating.`,
      ),
    );
  }
  for (const b of d.badges.slice(0, 5)) {
    blocks.push(text(`🏅 ${b.emoji} ${b.name} earned ${b.badge}.`));
  }
  return [...blocks, ...fikaLine(fika)];
}

/** Early afternoon, on a day nobody has played. */
export function nudgeBlocks(fika: FikaLine): CardBlock[] {
  return [
    heading("🎲 No game yet today — who's up?"),
    text("The box is free. Lowest score wins the day."),
    ...fikaLine(fika),
  ];
}

/** Monday, once the rota has drawn. */
export function fikaBlocks(duty: {
  name: string;
  emoji: string;
  reason: "worst_last_week" | "random_fallback";
  badness?: number | null;
  games?: number | null;
}): CardBlock[] {
  return [
    heading(`☕ ${duty.emoji} ${duty.name} buys fika this week`),
    text(
      duty.reason === "worst_last_week"
        ? `Worst last week — average finish ${Number(duty.badness ?? 0).toFixed(2)} over ${duty.games ?? 0} game${duty.games === 1 ? "" : "s"}.`
        : "Nobody eligible played last week, so this one was drawn at random.",
    ),
  ];
}
