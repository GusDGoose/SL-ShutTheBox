import "server-only";

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
