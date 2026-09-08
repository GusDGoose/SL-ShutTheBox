import type { ReactNode } from "react";

/**
 * Every chart on the stats pages goes through here.
 *
 * [concept: accessible chart] An SVG of a trend line is invisible to a screen
 * reader and useless to anyone who cannot make out a 2px stroke. Each chart
 * therefore ships twice: the drawing, marked `role="img"` with a one-sentence
 * summary, and the same numbers as a real `<table>` that is visually hidden but
 * fully readable. Putting it in one component is what stops the second half
 * from being forgotten on the next chart somebody adds.
 */
export function ChartFrame({
  title,
  label,
  columns,
  rows,
  footnote,
  children,
}: {
  /** Visible heading above the chart. */
  title: string;
  /** One sentence describing what the drawing shows, for `aria-label`. */
  label: string;
  /** Headers for the hidden data table. */
  columns: string[];
  /** The same data the chart draws, one array per row. */
  rows: (string | number)[][];
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="eyebrow">{title}</figcaption>

      {/* role="img" collapses the bars into one announceable thing carrying
          the summary; the table below is the detail behind it. Two levels on
          purpose — the summary is usually all anyone wants. */}
      <div
        role="img"
        aria-label={label}
        className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
      >
        {children}
      </div>

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={j}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {footnote && <p className="text-xs text-ink-muted">{footnote}</p>}
    </figure>
  );
}
