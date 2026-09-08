import { ChartFrame } from "./chart-frame";

export type ScoreCount = { score: number; n: number };

// Buckets rather than one bar per score: a 12-tile board can finish anywhere
// from 0 to 78, and seventy-nine bars on a 360px screen is a grey smear. The
// top bucket is open-ended so a prediction ruleset (which can reach 156)
// still lands somewhere.
const BUCKETS: { label: string; from: number; to: number }[] = [
  { label: "0", from: 0, to: 0 },
  { label: "1–5", from: 1, to: 5 },
  { label: "6–10", from: 6, to: 10 },
  { label: "11–15", from: 11, to: 15 },
  { label: "16–20", from: 16, to: 20 },
  { label: "21–30", from: 21, to: 30 },
  { label: "31–45", from: 31, to: 45 },
  { label: "46+", from: 46, to: Infinity },
];

/**
 * How often each score actually happens.
 *
 * The zero bucket is the shut box, so it gets the shut colour — it is the one
 * bar anybody looks for.
 */
export function Distribution({ scores }: { scores: ScoreCount[] }) {
  const counts = BUCKETS.map((b) => ({
    ...b,
    n: scores
      .filter((s) => s.score >= b.from && s.score <= b.to)
      .reduce((sum, s) => sum + s.n, 0),
  }));

  const total = counts.reduce((sum, c) => sum + c.n, 0);
  const max = Math.max(...counts.map((c) => c.n), 1);

  const label =
    total === 0
      ? "No scores recorded yet"
      : `Distribution of ${total} scores. Most common: ${
          counts.reduce((a, b) => (b.n > a.n ? b : a)).label
        }.`;

  return (
    <ChartFrame
      title="Score distribution"
      label={label}
      columns={["Score", "Times"]}
      rows={counts.map((c) => [c.label, c.n])}
      footnote="A 0 is a shut box."
    >
      <div className="flex h-40 items-end gap-1 sm:gap-2">
        {counts.map((c) => (
          <div
            key={c.label}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-[0.625rem] font-semibold tabular-nums text-ink-muted">
              {c.n > 0 ? c.n : ""}
            </span>
            <span
              className={`w-full rounded-t-[3px] ${
                c.from === 0 ? "bg-shut" : "bg-brass"
              }`}
              // A bucket that happened at least once keeps a 2px stub, so
              // "rare" and "never" do not look the same.
              style={{
                height: c.n === 0 ? "0" : `max(2px, ${(c.n / max) * 100}%)`,
              }}
            />
            <span className="text-[0.625rem] whitespace-nowrap text-ink-muted">
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}
