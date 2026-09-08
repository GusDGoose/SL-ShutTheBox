/**
 * The small pieces the stats tables are built from. All server components —
 * nothing here needs state, so nothing here ships JavaScript.
 */

/**
 * A number with a bar behind it, for a column where the comparison matters
 * more than the digits (day wins, games played).
 *
 * The bar is decoration: the value is always present as text, so it reads
 * correctly with images off and in a screen reader.
 */
export function BarRow({
  value,
  max,
  tint = "brass",
}: {
  value: number;
  max: number;
  tint?: "brass" | "shut" | "streak";
}) {
  // A zero-width bar for a zero value, and never a divide-by-zero.
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const colour =
    tint === "shut"
      ? "bg-shut"
      : tint === "streak"
        ? "bg-streak"
        : "bg-brass";

  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-right font-semibold tabular-nums">{value}</span>
      <span
        aria-hidden
        className="h-2 w-16 overflow-hidden rounded-full bg-surface-2 sm:w-24"
      >
        <span
          className={`block h-full rounded-full ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

/**
 * A change, up or down.
 *
 * [concept: never colour-only] The direction is carried by the ▲/▼ glyph and
 * the sign, not by the red/green. Colour is a second, redundant channel, so
 * the meaning survives both colour blindness and a greyscale print.
 */
export function Delta({
  value,
  digits = 1,
}: {
  value: number | null;
  digits?: number;
}) {
  if (value === null || Math.abs(value) < 0.05) {
    return (
      <span className="text-ink-muted tabular-nums">
        <span aria-hidden>–</span>
        <span className="sr-only">no change</span>
      </span>
    );
  }

  const up = value > 0;
  return (
    <span
      className={`tabular-nums ${up ? "text-shut" : "text-danger"}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>{" "}
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(digits)}
    </span>
  );
}

/**
 * A rating's recent shape, small enough to sit in a table cell.
 *
 * Drawn in a 100×24 viewBox and scaled by CSS, so it never has a pixel width
 * that could push the table wider than the phone it is on.
 */
export function Sparkline({
  values,
  label,
  /** What one point is. Announced, so it has to match what is plotted. */
  unit = "rated games",
  /**
   * Which way is good. A rating going up is progress; an average SCORE going
   * up is not, and this line is used for both — without the distinction a
   * player improving month on month got a red line directly above a caption
   * saying a falling line means they are improving.
   */
  goodDirection = "up",
}: {
  values: number[];
  label: string;
  unit?: string;
  goodDirection?: "up" | "down";
}) {
  if (values.length < 2) {
    return (
      <span className="text-xs text-ink-muted">
        <span aria-hidden>—</span>
        <span className="sr-only">not enough games yet</span>
      </span>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat line would divide by zero; put it through the middle instead.
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 22 - ((v - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = values[values.length - 1];
  const first = values[0];
  const improving =
    goodDirection === "up" ? last >= first : last <= first;

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-6 w-20 sm:w-28"
      role="img"
      aria-label={`${label}: ${first.toFixed(0)} to ${last.toFixed(0)} over the last ${values.length} ${unit}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={improving ? "var(--color-shut)" : "var(--color-danger)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
