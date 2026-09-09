import { ChartFrame } from "./chart-frame";

export type RatingPoint = { date: string; rating: number };

/**
 * A rating over time: a line with a soft area under it, the latest value
 * labelled. Drawn in a fixed viewBox and scaled by CSS so it never has a pixel
 * width that could widen a phone. X is one step per rated game rather than
 * calendar time — the office plays on weekdays, and calendar gaps would just be
 * weekends drawn as flat lines.
 */
export function RatingChart({
  points,
  label,
}: {
  points: RatingPoint[];
  label: string;
}) {
  if (points.length < 2) {
    return (
      <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-6 text-sm text-ink-muted">
        Ratings take shape after a couple of games.
      </p>
    );
  }

  const W = 320;
  const H = 120;
  const PAD = { top: 14, right: 44, bottom: 10, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = points.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Breathing room above and below, and never a zero-height range.
  const span = Math.max(max - min, 20);
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left},${(PAD.top + innerH).toFixed(1)} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = last.rating - first.rating;

  return (
    <ChartFrame
      title="Rating"
      label={`${label}'s rating: ${Math.round(first.rating)} to ${Math.round(last.rating)} over ${points.length} rated games, ${delta >= 0 ? "up" : "down"} ${Math.abs(Math.round(delta))}.`}
      columns={["Game", "Date", "Rating"]}
      rows={points.map((p, i) => [i + 1, p.date, Math.round(p.rating)])}
      footnote="Everyone starts at 1000. Beating a stronger player moves it more."
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        aria-hidden
      >
        {/* The 1000 line, when it is in view: the mark everyone started on. */}
        {1000 > lo && 1000 < hi && (
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={y(1000)}
            y2={y(1000)}
            stroke="var(--color-line)"
            strokeDasharray="3 3"
          />
        )}
        <path d={area} fill="var(--color-brass)" opacity="0.18" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-brass-ink)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(points.length - 1)}
          cy={y(last.rating)}
          r="3.5"
          fill="var(--color-brass-ink)"
        />
        <text
          x={x(points.length - 1) + 7}
          y={y(last.rating) + 4}
          fontSize="12"
          fontWeight="700"
          fill="var(--color-ink)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {Math.round(last.rating)}
        </text>
      </svg>
    </ChartFrame>
  );
}
