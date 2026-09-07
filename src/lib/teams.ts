import "server-only";
import { supabaseAdmin } from "./supabase";

// [concept: webhook + Adaptive Card] Classic Office 365 "Incoming Webhook"
// connectors are retired — this posts to a Teams *Workflows* webhook
// ("Post to a channel when a webhook request is received"), which expects an
// Adaptive Card wrapped in a message envelope, not plain {"text": ...}.

export type AnnouncedWinner = {
  name: string;
  emoji: string;
  score: number;
  streak: number;
  shutBox: boolean;
};

export async function postWinnerCard(winners: AnnouncedWinner[]): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url || winners.length === 0) return; // feature silently off

  const names = winners.map((w) => `${w.emoji} ${w.name}`).join(" & ");
  const score = winners[0].score;
  const shutBox = winners.some((w) => w.shutBox);
  const maxStreak = Math.max(...winners.map((w) => w.streak));

  const body: object[] = [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: `👑 ${names} won today's Shut the Box!`,
      wrap: true,
    },
    {
      type: "TextBlock",
      text: shutBox
        ? `Winning score: ${score} — 📦 THE BOX WAS SHUT!`
        : `Winning score: ${score}`,
      wrap: true,
    },
  ];
  if (maxStreak >= 2) {
    body.push({ type: "TextBlock", text: `🔥 ${maxStreak} days running`, wrap: true });
  }

  const appUrl = process.env.APP_URL;
  const payload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          ...(appUrl
            ? {
                actions: [
                  { type: "Action.OpenUrl", title: "Open the scoreboard", url: appUrl },
                ],
              }
            : {}),
        },
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Teams webhook responded ${res.status}`);
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
