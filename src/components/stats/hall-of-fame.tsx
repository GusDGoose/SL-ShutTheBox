import Link from "next/link";
import type { Player } from "@/lib/types";

export type HallRow = {
  key: string;
  player_id: string;
  value: number;
  game_id: string | null;
  played_on: string | null;
};

// One entry per superlative, in the order they belong on the page. The copy
// lives here rather than in SQL so the view stays about numbers.
const SUPERLATIVES: Record<
  string,
  { eyebrow: string; emoji: string; format: (v: number) => string }
> = {
  lowest_score: {
    eyebrow: "Lowest score ever",
    emoji: "🎯",
    format: (v) => v.toFixed(0),
  },
  most_shut_boxes: {
    eyebrow: "Most shut boxes",
    emoji: "📦",
    format: (v) => v.toFixed(0),
  },
  longest_streak: {
    eyebrow: "Longest streak",
    emoji: "🔥",
    format: (v) => `${v.toFixed(0)} days`,
  },
  peak_rating: {
    eyebrow: "Highest rating",
    emoji: "📈",
    format: (v) => v.toFixed(0),
  },
  biggest_choke: {
    eyebrow: "Biggest choke",
    emoji: "😬",
    // A rating loss, so always negative — rendered with a real minus sign
    // rather than a hyphen, to match the deltas in the ratings table.
    format: (v) => v.toFixed(1).replace("-", "−"),
  },
};

const ORDER = [
  "lowest_score",
  "most_shut_boxes",
  "longest_streak",
  "peak_rating",
  "biggest_choke",
];

/**
 * The records.
 *
 * [concept: computed in SQL, not in the page] v1 worked "lowest score ever"
 * out in TypeScript over the most recent 200 result rows, so the record
 * quietly became wrong as soon as the history outgrew that window. The
 * hall_of_fame view answers it over everything.
 */
export function HallOfFame({
  rows,
  players,
}: {
  rows: HallRow[];
  players: Map<string, Player>;
}) {
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ORDER.map((key) => {
        const meta = SUPERLATIVES[key];
        const row = byKey.get(key);
        const player = row ? players.get(row.player_id) : undefined;

        return (
          <li
            key={key}
            className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-line bg-surface p-4"
          >
            <p className="eyebrow">
              <span aria-hidden>{meta.emoji}</span> {meta.eyebrow}
            </p>

            {row && player ? (
              <>
                <p className="font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums">
                  {meta.format(row.value)}
                </p>
                <p className="text-sm text-ink-muted">
                  <span aria-hidden>{player.emoji}</span>{" "}
                  <span className="font-medium text-ink">{player.name}</span>
                  {row.played_on && (
                    <>
                      {" · "}
                      {row.game_id ? (
                        <Link
                          href={`/game/${row.game_id}`}
                          className="underline hover:text-ink"
                        >
                          {row.played_on}
                        </Link>
                      ) : (
                        row.played_on
                      )}
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="py-2 text-sm text-ink-muted">
                Nothing legendary here. Yet.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
