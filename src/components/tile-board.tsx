"use client";

// The on-screen replica of the physical box: tiles start UP, tap to flip DOWN.
// Controlled component — the parent owns which tiles are down.
const TILES = Array.from({ length: 12 }, (_, i) => i + 1);

export function TileBoard({
  tilesDown,
  onToggle,
}: {
  tilesDown: Set<number>;
  onToggle: (tile: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2 max-sm:grid-cols-3 sm:grid-cols-12">
      {TILES.map((tile) => {
        const down = tilesDown.has(tile);
        return (
          <button
            key={tile}
            type="button"
            aria-pressed={down}
            aria-label={`Tile ${tile} ${down ? "down" : "up"}`}
            onClick={() => onToggle(tile)}
            className={`flex aspect-[2/3] items-end justify-center rounded-lg border pb-2 text-xl font-bold transition-all sm:text-2xl ${
              down
                ? "translate-y-1 border-black/10 bg-black/5 text-black/25 dark:border-white/10 dark:bg-white/5 dark:text-white/25"
                : "border-amber-700/40 bg-amber-100 text-amber-950 shadow-md active:scale-95 dark:bg-amber-200"
            }`}
          >
            {tile}
          </button>
        );
      })}
    </div>
  );
}
