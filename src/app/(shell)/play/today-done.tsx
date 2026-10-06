import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import type { DayWinner } from "@/lib/queries/day";

/**
 * What Play shows once today's game has been crowned.
 *
 * One game counts a day (0023). On 2026-10-01 and 2026-10-05 a second game
 * was started after the first one ended, and it counted as a second win — so
 * there is no Start button here, only the way to the game that counts, where a
 * mistake can be corrected.
 */
export function TodayDone({
  gameId,
  winners,
  score,
}: {
  gameId: string;
  winners: DayWinner[];
  score: number;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        Today&apos;s game is done
      </h1>

      {winners.length > 0 && (
        <p className="text-lg">
          {winners.map((w, i) => (
            <span key={w.player_id}>
              {i > 0 && (i === winners.length - 1 ? " and " : ", ")}
              <span aria-hidden className="mr-1">
                {w.emoji}
              </span>
              <span className="font-bold">{w.name}</span>
            </span>
          ))}{" "}
          {winners.length > 1 ? "shared the day with" : "won the day with"}{" "}
          <span className="font-[family-name:var(--font-display)] font-bold tabular-nums">
            {score === 0 ? "📦 0" : score}
          </span>{" "}
          👑
        </p>
      )}

      <p className="text-sm text-ink-muted">
        One game counts a day. Spotted a mistake? Correct it on the game&apos;s
        page — the next game is tomorrow.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href={`/game/${gameId}`} className={buttonClass("primary")}>
          See today&apos;s game
        </Link>
        <Link href="/" className={buttonClass("secondary")}>
          Today
        </Link>
      </div>
    </section>
  );
}
