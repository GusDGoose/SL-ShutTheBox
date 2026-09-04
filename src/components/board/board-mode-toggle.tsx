"use client";

export type BoardMode = "board" | "keypad";

/**
 * Tap the board, or type the score because you already played on the real one.
 * v1's escape hatch, kept — it is what makes the app usable when someone
 * forgets to open it until the game is over.
 */
export function BoardModeToggle({
  mode,
  onChange,
}: {
  mode: BoardMode;
  onChange: (mode: BoardMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How to enter this turn"
      className="flex rounded-[var(--radius-control)] border border-line bg-surface p-1 text-sm"
    >
      {(["board", "keypad"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={mode === option}
          onClick={() => onChange(option)}
          className={`min-h-9 rounded-[calc(var(--radius-control)-0.25rem)] px-3 font-semibold transition-colors ${
            mode === option
              ? "bg-brass text-ink"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {option === "board" ? "Board" : "Type score"}
        </button>
      ))}
    </div>
  );
}
