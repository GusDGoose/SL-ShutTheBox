/**
 * The Adaptive Card bodies, as pure functions.
 *
 * Split out of teams.ts on purpose: that module is `server-only` and does the
 * posting, which cannot be unit-tested without a webhook. The wording and the
 * arithmetic — plurals, the streak threshold, whether a line appears at all —
 * are the parts that get things wrong in front of the whole team, so they
 * live here where a test can read them.
 *
 * [concept: the cards are Swedish, the app is English] Gustav asked for the
 * cards in Swedish on 2026-09-14. They land in a Swedish office's Teams
 * channel and are read by everyone, whereas the app itself stays English by
 * the decision made at the start of the rebuild. So this file — and only this
 * file — carries Swedish copy, including Swedish plurals (ett spel / två
 * spel) and the decimal comma.
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

/** Swedish writes 0,83 rather than 0.83. */
function decimal(n: number, places = 2): string {
  return n.toFixed(places).replace(".", ",");
}

/** "3 spel" / "1 spel" — the noun does not change, only the participle does. */
function games(n: number): string {
  return `${n} spel`;
}

/** "☕ Denna vecka: 🦊 Alice bjuder på fika" — appended to every card. */
export function fikaLine(fika: FikaLine): CardBlock[] {
  if (!fika) return [];
  return [
    text(`☕ Denna vecka: ${fika.emoji} ${fika.name} bjuder på fika`, {
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
        ? `👑 ${names} delar på dagens seger!`
        : `👑 ${names} vann dagens Shut the Box!`,
    ),
    text(
      shutBox
        ? `Vinnande poäng: ${score} — 📦 LÅDAN STÄNGDES!`
        : `Vinnande poäng: ${score}`,
    ),
  ];
  // A streak of one is just "won today", which the heading already said.
  if (maxStreak >= 2) blocks.push(text(`🔥 ${maxStreak} dagar i rad`));
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
  const blocks: CardBlock[] = [heading("🎲 Förra veckan vid lådan")];

  if (d.gamesPlayed === 0) {
    blocks.push(text("Inte ett enda spel spelades. Lådan börjar bli dammig."));
    return [...blocks, ...fikaLine(fika)];
  }

  blocks.push(
    text(`${games(d.gamesPlayed)} ${d.gamesPlayed === 1 ? "spelat" : "spelade"}.`),
  );
  if (d.champion) {
    blocks.push(
      text(
        `🏆 ${d.champion.emoji} ${d.champion.name} vann veckan med ${d.champion.days} ${d.champion.days === 1 ? "dag" : "dagar"}.`,
      ),
    );
  }
  if (d.longestStreak && d.longestStreak.days >= 2) {
    blocks.push(
      text(
        `🔥 ${d.longestStreak.emoji} ${d.longestStreak.name} är uppe i ${d.longestStreak.days} dagar i rad.`,
      ),
    );
  }
  if (d.topGainer && d.topGainer.delta > 0) {
    blocks.push(
      text(
        `📈 Störst klättring: ${d.topGainer.emoji} ${d.topGainer.name}, +${Math.round(d.topGainer.delta)} i rating.`,
      ),
    );
  }
  for (const b of d.badges.slice(0, 5)) {
    blocks.push(text(`🏅 ${b.emoji} ${b.name} tog utmärkelsen ${b.badge}.`));
  }
  return [...blocks, ...fikaLine(fika)];
}

/**
 * 12:40 — just before the box comes out.
 *
 * This replaces an "is anyone playing?" nudge that fired at 14:00, after the
 * fact, which Gustav dropped on 2026-09-14: a reminder is only worth sending
 * while there is still time to walk over. That is also why it needs the
 * minute precision Vercel Hobby cron cannot give and pg_cron can.
 *
 * "om några minuter" rather than "om 5 minuter" on purpose — it stays true
 * if a run is ever a minute or two late, and a reminder that contradicts the
 * clock is worse than a vague one.
 */
export function prematchBlocks(fika: FikaLine): CardBlock[] {
  return [
    heading("🎲 Snart match!"),
    text("Vi kör 12:45 vid lådan, om några minuter. Lägst poäng vinner dagen."),
    ...fikaLine(fika),
  ];
}

/**
 * Monday, once the rota has drawn.
 *
 * `avgFinish` is the plain average finishing place (4,5 on two games), NOT
 * the normalised 0–1 badness the draw ranks by. The card once showed the
 * badness under the name "snittplacering", and "1,00" read as "came first"
 * the week the buyer had come last twice. A duty drawn before 0022 has no
 * average to show, and the line simply leaves the number out.
 */
export function fikaBlocks(duty: {
  name: string;
  emoji: string;
  reason: "worst_last_week" | "random_fallback";
  avgFinish?: number | null;
  games?: number | null;
}): CardBlock[] {
  const played = games(duty.games ?? 0);
  const worst =
    duty.avgFinish == null
      ? `Sämst förra veckan på ${played}.`
      : `Sämst förra veckan — snittplacering ${decimal(Number(duty.avgFinish), 1)} på ${played}.`;
  return [
    heading(`☕ ${duty.emoji} ${duty.name} bjuder på fika denna vecka`),
    text(
      duty.reason === "worst_last_week"
        ? worst
        : "Ingen behörig spelade förra veckan, så lotten fick avgöra.",
    ),
  ];
}
