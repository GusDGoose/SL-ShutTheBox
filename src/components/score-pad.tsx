"use client";

import { useState } from "react";

// Manual score entry — for when the game already happened and someone just
// reads the scores off the physical box.
export function ScorePad({
  maxScore,
  onSubmit,
}: {
  maxScore: number;
  onSubmit: (score: number) => void;
}) {
  const [value, setValue] = useState("");
  const parsed = Number(value);
  const valid = value !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= maxScore;

  return (
    <div className="flex items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium opacity-70">
        Score (0–{maxScore})
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 7"
          className="w-28 rounded-lg border border-black/20 bg-transparent px-3 py-2 text-lg outline-none focus:border-black/60 dark:border-white/20 dark:focus:border-white/60"
        />
      </label>
      <button
        type="button"
        disabled={!valid}
        onClick={() => valid && onSubmit(parsed)}
        className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-40"
      >
        End turn
      </button>
    </div>
  );
}
