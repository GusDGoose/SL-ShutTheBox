"use client";

import { useState } from "react";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSfx } from "@/components/ui/audio-provider";

/**
 * Typing a score when the game was already played on the real box.
 *
 * A keypad rather than a text input, which is what v1 used: on a phone the
 * software keyboard shoves the board off screen, and on the wall tablet there
 * is no keyboard at all.
 */
export function ScoreKeypad({
  max,
  onSubmit,
  submitLabel = "End turn",
}: {
  max: number;
  onSubmit: (score: number) => void;
  submitLabel?: string;
}) {
  const [value, setValue] = useState("");
  const { play } = useSfx();
  const numeric = value === "" ? null : Number.parseInt(value, 10);
  const tooBig = numeric !== null && numeric > max;
  const valid = numeric !== null && numeric >= 0 && numeric <= max;

  function press(digit: string) {
    const next = `${value}${digit}`.replace(/^0+(?=\d)/, "");
    if (Number.parseInt(next, 10) > max) {
      play("error");
      // Show what they typed so the limit is visible, rather than swallowing it.
      setValue(next.slice(0, String(max).length));
      return;
    }
    play("tileUp");
    setValue(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">Score (0–{max})</span>
        {tooBig && (
          <span role="alert" className="text-xs font-semibold text-danger">
            That is more than the board can hold.
          </span>
        )}
      </div>

      <output
        aria-live="polite"
        className={`rounded-[var(--radius-control)] border bg-surface px-4 py-3 text-right font-[family-name:var(--font-display)] text-4xl font-extrabold tabular-nums ${
          tooBig ? "border-danger text-danger" : "border-line"
        }`}
      >
        {value === "" ? "0" : value}
      </output>

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <Button
            key={digit}
            variant="secondary"
            size="lg"
            onClick={() => press(digit)}
            aria-label={`Digit ${digit}`}
          >
            {digit}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="lg"
          onClick={() => {
            play("tileUp");
            setValue((v) => v.slice(0, -1));
          }}
          aria-label="Delete last digit"
        >
          <Delete aria-hidden size={20} />
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => press("0")}
          aria-label="Digit 0"
        >
          0
        </Button>
        <Button
          size="lg"
          disabled={!valid}
          onClick={() => {
            play("endTurn");
            onSubmit(numeric!);
          }}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
