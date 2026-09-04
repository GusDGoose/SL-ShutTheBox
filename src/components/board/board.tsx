"use client";

import { useRef } from "react";
import { boardTiles, type Ruleset } from "@/lib/rules";

/**
 * The on-screen replica of the physical box: tiles start up, tap to flip down.
 *
 * Controlled — the parent owns which tiles are down, exactly as the v1 board
 * did. Two things are new: the tile count comes from the ruleset rather than
 * being hard-coded to 12, and leaving out `onToggle` gives a read-only board
 * for spectators, which renders as images rather than buttons so nobody can tab
 * into controls they are not allowed to use.
 */
export function Board({
  rules,
  down,
  onToggle,
  label,
}: {
  rules: Ruleset;
  down: ReadonlySet<number>;
  onToggle?: (tile: number) => void;
  label?: string;
}) {
  const tiles = boardTiles(rules);
  const readOnly = !onToggle;
  const shut = down.size === tiles.length;
  const goldenTiles = new Set(
    (rules.modifiers ?? [])
      .filter((m) => m.kind === "golden_tile")
      .map((m) => m.tile),
  );

  // Typing "1" then "2" quickly means tile 12, not tile 1 then tile 2.
  const digitBuffer = useRef<{ digits: string; at: number }>({
    digits: "",
    at: 0,
  });

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (readOnly) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const buttons = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tile]"),
      );
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index === -1) return;
      const next =
        event.key === "ArrowRight"
          ? (index + 1) % buttons.length
          : (index - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
      event.preventDefault();
      return;
    }

    if (!/^[0-9]$/.test(event.key)) return;

    const now = Date.now();
    const buffer = digitBuffer.current;
    const digits =
      now - buffer.at < 400 ? `${buffer.digits}${event.key}` : event.key;
    digitBuffer.current = { digits, at: now };

    // Prefer the longer number when both are on the board (1 and 12).
    const asPair = Number.parseInt(digits.slice(-2), 10);
    const asSingle = Number.parseInt(event.key, 10);
    const tile =
      digits.length > 1 && asPair >= 1 && asPair <= tiles.length
        ? asPair
        : asSingle;

    if (tile >= 1 && tile <= tiles.length) {
      onToggle(tile);
      event.preventDefault();
    }
  }

  return (
    <div
      className="tray felt rounded-[var(--radius-card)] p-3"
      data-shut={shut || undefined}
      onKeyDown={handleKeyDown}
      role={readOnly ? "img" : "group"}
      aria-label={
        label ??
        (readOnly
          ? `Board: ${tiles.length - down.size} of ${tiles.length} tiles still up`
          : "The box")
      }
    >
      {/* Two rows on a phone, one long row from sm up — see .tile-grid. */}
      <div
        className="tile-grid gap-1.5 sm:gap-2"
        style={
          {
            "--tile-cols": Math.ceil(tiles.length / 2),
            "--tile-cols-wide": tiles.length,
          } as React.CSSProperties
        }
      >
        {tiles.map((tile) => {
          const isDown = down.has(tile);
          const golden = goldenTiles.has(tile);
          const content = (
            <span className="tile-face">
              <span>{tile}</span>
            </span>
          );

          if (readOnly) {
            return (
              <span
                key={tile}
                className="tile"
                data-down={isDown || undefined}
                data-golden={golden || undefined}
              >
                {content}
              </span>
            );
          }

          return (
            <button
              key={tile}
              type="button"
              data-tile={tile}
              data-down={isDown || undefined}
              data-golden={golden || undefined}
              className="tile active:scale-[0.97]"
              aria-pressed={isDown}
              aria-label={`Tile ${tile} ${isDown ? "down" : "up"}${
                golden ? ", golden" : ""
              }`}
              onClick={() => onToggle(tile)}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
