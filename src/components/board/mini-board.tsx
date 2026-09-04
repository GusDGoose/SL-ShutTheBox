/**
 * A thumbnail of which tiles were left standing, for result rows and history
 * cards — an inline SVG rather than a real board, so a list of twenty games
 * costs twenty small shapes instead of hundreds of DOM nodes.
 */
export function MiniBoard({
  tiles,
  open,
  className = "",
}: {
  tiles: number;
  /** Tiles still up. Null means the score was typed, so the board is unknown. */
  open: number[] | null;
  className?: string;
}) {
  if (open === null) {
    return (
      <span
        className={`text-xs text-ink-muted ${className}`}
        title="Score was typed in, not tapped out on the board"
      >
        ⌨
      </span>
    );
  }

  const width = tiles * 5 - 1;
  const standing = new Set(open);

  return (
    <svg
      viewBox={`0 0 ${width} 14`}
      width={width}
      height={14}
      role="img"
      aria-label={
        open.length === 0
          ? "Shut the box — every tile down"
          : `Tiles left up: ${[...open].sort((a, b) => a - b).join(", ")}`
      }
      className={`shrink-0 ${className}`}
    >
      {Array.from({ length: tiles }, (_, i) => {
        const tile = i + 1;
        const up = standing.has(tile);
        return (
          <rect
            key={tile}
            x={i * 5}
            y={up ? 0 : 6}
            width={4}
            height={up ? 14 : 8}
            rx={1}
            fill={up ? "var(--color-wood-light)" : "var(--color-line)"}
          />
        );
      })}
    </svg>
  );
}
