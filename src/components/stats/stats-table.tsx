import type { CSSProperties, ReactNode } from "react";

/**
 * The shared table for every stats page.
 *
 * Wide tables scroll inside their own container so the PAGE never scrolls
 * sideways — at 360px the standings and ratings tables are both wider than the
 * screen, and a horizontally scrolling page drags the tab bar off the edge.
 *
 * `stickyFirstColumn` pins the player name while the numbers scroll under it;
 * without it you scroll right to read a win count and can no longer see whose
 * it is.
 */
export function StatsTable({
  headers,
  children,
  caption,
  stickyFirstColumn = true,
}: {
  headers: ReactNode[];
  children: ReactNode;
  caption?: string;
  stickyFirstColumn?: boolean;
}) {
  // Matches whatever element leads the row. The first cell of a body row is a
  // `<th scope="row">` (it labels the row), so a `td:first-child` selector —
  // which is what this used to be — silently pinned nothing at all.
  const sticky = stickyFirstColumn
    ? "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-10"
    : "";

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={sticky}>
          <tr className="border-b border-line text-left [&>*]:bg-surface">
            {headers.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="eyebrow px-3 py-2.5 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={sticky}>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * One body row.
 *
 * Every cell paints `--row-bg` rather than the row painting itself: a sticky
 * cell slides over its neighbours, so it needs its own opaque background or
 * the scrolling numbers show straight through the player's name. Driving it
 * from one variable keeps the pinned cell the same colour as the rest of its
 * row, tint included.
 */
export function StatsRow({
  children,
  highlight = false,
}: {
  children: ReactNode;
  highlight?: boolean;
}) {
  return (
    <tr
      style={
        {
          "--row-bg": highlight
            ? "color-mix(in oklab, var(--color-brass) 12%, var(--color-surface))"
            : "var(--color-surface)",
        } as CSSProperties
      }
      className="border-b border-line/60 last:border-0 [&>*]:bg-[var(--row-bg)]"
    >
      {children}
    </tr>
  );
}

/** A body cell. `num` right-aligns and uses tabular figures so columns line up. */
export function Cell({
  children,
  num = false,
  className = "",
  header = false,
}: {
  children: ReactNode;
  num?: boolean;
  className?: string;
  header?: boolean;
}) {
  const cls = [
    "px-3 py-2.5 whitespace-nowrap",
    num ? "text-right tabular-nums" : "",
    className,
  ].join(" ");

  return header ? (
    <th scope="row" className={`${cls} text-left font-medium`}>
      {children}
    </th>
  ) : (
    <td className={cls}>{children}</td>
  );
}
