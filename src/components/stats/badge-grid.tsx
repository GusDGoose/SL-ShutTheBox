import Link from "next/link";
import type { EarnedBadge } from "@/lib/queries/history";
import type { AchievementRow } from "@/lib/types";

/**
 * Every badge in the catalog: the earned ones bright, with when and where;
 * the rest muted, so a player can see what is still out there.
 */
export function BadgeGrid({
  catalog,
  earned,
}: {
  catalog: AchievementRow[];
  earned: EarnedBadge[];
}) {
  const byKey = new Map(earned.map((e) => [e.key, e]));

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {catalog.map((badge) => {
        const got = byKey.get(badge.key);
        return (
          <li
            key={badge.key}
            className={`flex items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 ${
              got
                ? "border-brass/50 bg-brass/10"
                : "border-line text-ink-muted"
            }`}
          >
            <span aria-hidden className={`text-2xl ${got ? "" : "grayscale opacity-50"}`}>
              {got ? badge.emoji : "🔒"}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">
                {badge.name}
                {got && badge.repeatable && got.times > 1 && (
                  <span className="ml-1 text-xs text-ink-muted tabular-nums">
                    ×{got.times}
                  </span>
                )}
              </span>
              <span className="text-xs">{badge.description}</span>
              {got && (
                <span className="mt-0.5 text-xs text-ink-muted tabular-nums">
                  {got.game_id ? (
                    <Link href={`/game/${got.game_id}`} className="underline hover:text-ink">
                      {got.earned_at.slice(0, 10)}
                    </Link>
                  ) : (
                    got.earned_at.slice(0, 10)
                  )}
                </span>
              )}
            </span>
            {!got && <span className="sr-only">not yet earned</span>}
          </li>
        );
      })}
    </ul>
  );
}
