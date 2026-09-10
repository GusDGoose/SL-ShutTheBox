import "server-only";
import { supabaseAdmin } from "./supabase";
import {
  digestBlocks,
  fikaBlocks,
  nudgeBlocks,
  winnerBlocks,
  type CardBlock,
  type Digest,
  type FikaLine,
} from "./teams-cards";

// [concept: webhook + Adaptive Card] Classic Office 365 "Incoming Webhook"
// connectors are retired — this posts to a Teams *Workflows* webhook
// ("Post to a channel when a webhook request is received"), which expects an
// Adaptive Card wrapped in a message envelope, not plain {"text": ...}.
//
// Every function here is best-effort by design: a Teams outage must never
// cost somebody their game. Callers either ignore the result or log it.

export type AnnouncedWinner = {
  name: string;
  emoji: string;
  score: number;
  streak: number;
  shutBox: boolean;
};

type Action = { title: string; url: string };

/**
 * Post one card. Returns false when the feature is off or the post failed —
 * never throws, because every caller is in the middle of doing something the
 * user cares about more than a chat message.
 */
export async function postCard(
  blocks: CardBlock[],
  actions: Action[] = [],
): Promise<boolean> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url || blocks.length === 0) return false;

  const appUrl = process.env.APP_URL;
  const openApp: Action[] = appUrl
    ? [{ title: "Open the scoreboard", url: appUrl }]
    : [];
  const all = [...actions, ...openApp];

  const payload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: blocks,
          ...(all.length
            ? {
                actions: all.map((a) => ({
                  type: "Action.OpenUrl",
                  title: a.title,
                  url: a.url,
                })),
              }
            : {}),
        },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // A hanging webhook must not hold a serverless function open.
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** This week's fika buyer, for the line every card carries. */
async function currentFika(): Promise<FikaLine> {
  const { data } = await supabaseAdmin()
    .from("fika_current")
    .select("name, emoji")
    .maybeSingle();
  return (data as { name: string; emoji: string } | null) ?? null;
}

export async function postWinnerCard(
  winners: AnnouncedWinner[],
): Promise<boolean> {
  if (!process.env.TEAMS_WEBHOOK_URL || winners.length === 0) return false;
  return postCard(winnerBlocks(winners, await currentFika()));
}

/**
 * Announces a finished game, reading the winner from `game_results`.
 *
 * v1 recomputed it here with Math.min over the payload it had just posted,
 * which made three separate implementations of "who won" — the SQL view, the
 * review screen, and this. They already disagreed: a solo game showed no crown
 * on the review screen but crowned the player everywhere else. The view is now
 * the only one that decides.
 */
export async function announceWinners(gameId: string): Promise<void> {
  if (!process.env.TEAMS_WEBHOOK_URL) return; // feature silently off

  const sb = supabaseAdmin();

  const { data: results, error } = await sb
    .from("game_results")
    .select("player_id, score, is_winner, is_shut_box")
    .eq("game_id", gameId);
  if (error) throw new Error(error.message);

  const winners = (results ?? []).filter(
    (r) => (r as { is_winner: boolean }).is_winner,
  ) as { player_id: string; score: number; is_shut_box: boolean }[];
  if (winners.length === 0) return;

  const ids = winners.map((w) => w.player_id);
  const [playersRes, streaksRes] = await Promise.all([
    sb.from("players").select("id, name, emoji").in("id", ids),
    sb.from("player_streaks").select("player_id, current_streak").in("player_id", ids),
  ]);

  const names = new Map(
    ((playersRes.data ?? []) as { id: string; name: string; emoji: string }[]).map(
      (p) => [p.id, p],
    ),
  );
  const streaks = new Map(
    (
      (streaksRes.data ?? []) as {
        player_id: string;
        current_streak: number;
      }[]
    ).map((s) => [s.player_id, s.current_streak]),
  );

  await postWinnerCard(
    winners.map((w) => ({
      name: names.get(w.player_id)?.name ?? "Someone",
      emoji: names.get(w.player_id)?.emoji ?? "🎲",
      score: w.score,
      streak: streaks.get(w.player_id) ?? 0,
      shutBox: w.is_shut_box,
    })),
  );
}

/** Monday morning: how last week went. */
export async function postDigest(digest: Digest): Promise<boolean> {
  return postCard(digestBlocks(digest, await currentFika()));
}

/** Early afternoon on a day nobody has played yet. */
export async function postNudge(): Promise<boolean> {
  const appUrl = process.env.APP_URL;
  return postCard(
    nudgeBlocks(await currentFika()),
    appUrl ? [{ title: "Start a game 🎲", url: `${appUrl}/play` }] : [],
  );
}

/** Monday, once the rota has drawn. */
export async function postFikaCard(duty: {
  name: string;
  emoji: string;
  reason: "worst_last_week" | "random_fallback";
  badness?: number | null;
  games?: number | null;
}): Promise<boolean> {
  const appUrl = process.env.APP_URL;
  return postCard(
    fikaBlocks(duty),
    appUrl ? [{ title: "The rota ☕", url: `${appUrl}/fika` }] : [],
  );
}
