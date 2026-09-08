import Link from "next/link";
import { tilesOf, type Ruleset } from "@/lib/rules";

export type SeasonSummary = {
  id: string;
  slug: string;
  number: number;
  name: string;
  starts_on: string;
  ends_on: string;
  rules: Ruleset;
};

/**
 * Which season is being played, under which rules.
 *
 * Shown wherever a game is about to be played or looked at, because the rules
 * can differ between seasons now — and a score means nothing without knowing
 * which rules produced it.
 */
export function SeasonBanner({
  season,
  compact = false,
}: {
  season: SeasonSummary;
  compact?: boolean;
}) {
  const ends = new Date(`${season.ends_on}T12:00:00Z`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long" },
  );
  const rules = season.rules;

  if (compact) {
    return (
      <p className="text-sm text-ink-muted">
        {tilesOf(rules)} tiles ·{" "}
        {rules.win === "lowest" ? "lowest score wins" : "highest score wins"} ·{" "}
        <Link href="/rules" className="font-semibold underline">
          house rules
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3">
      <span className="font-[family-name:var(--font-display)] text-lg font-bold">
        Season {season.number}
      </span>
      {/* A season nobody has named is called "Season N" already, so printing
          both reads "Season 2  Season 2". */}
      {season.name !== `Season ${season.number}` && (
        <span className="font-semibold text-brass-ink">{season.name}</span>
      )}
      <span className="text-sm text-ink-muted">
        {tilesOf(rules)} tiles ·{" "}
        {rules.win === "lowest" ? "lowest wins" : "highest wins"} · ends {ends}
      </span>
      <Link
        href="/rules"
        className="ml-auto text-sm font-semibold text-ink-muted underline hover:text-ink"
      >
        House rules →
      </Link>
    </div>
  );
}
