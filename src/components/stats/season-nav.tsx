import Link from "next/link";
import { stockholmToday } from "@/lib/dates";
import type { SeasonWithRules } from "@/lib/queries/stats";

/**
 * Moving between this season, the ones before it, and all-time.
 *
 * Wraps rather than scrolls sideways: a scrolling strip would hide the
 * all-time link off the right edge of a phone, which is where most of the
 * interesting numbers are.
 */
export function SeasonNav({
  seasons,
  currentId,
  active,
}: {
  seasons: SeasonWithRules[];
  /** The season being played right now — its link is "This season". */
  currentId: string;
  /** Which pill is on: a season id, or "all-time". */
  active: string;
}) {
  const pill = (on: boolean) =>
    [
      "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-semibold",
      "transition-colors duration-[var(--duration-fast)]",
      on
        ? "bg-brass text-ink"
        : "border border-line text-ink-muted hover:bg-surface-2 hover:text-ink",
    ].join(" ");

  // A season planned for next quarter has no games and cannot get any until it
  // starts, so it would be a pill that only ever leads to an empty table. The
  // rules page is where a coming season belongs. It is still listed if it is
  // the one being looked at, so a bookmarked link keeps its place in the nav.
  const today = stockholmToday();
  const listed = seasons.filter(
    (s) => s.starts_on <= today || s.id === active,
  );

  return (
    <nav aria-label="Stats period" className="flex flex-wrap gap-2">
      {listed.map((s) => {
        const isCurrent = s.id === currentId;
        return (
          <Link
            key={s.id}
            href={isCurrent ? "/stats" : `/stats/season/${s.id}`}
            className={pill(active === s.id)}
            aria-current={active === s.id ? "page" : undefined}
          >
            {isCurrent ? "This season" : `Season ${s.number}`}
          </Link>
        );
      })}
      <Link
        href="/stats/all-time"
        className={pill(active === "all-time")}
        aria-current={active === "all-time" ? "page" : undefined}
      >
        All-time
      </Link>
    </nav>
  );
}
