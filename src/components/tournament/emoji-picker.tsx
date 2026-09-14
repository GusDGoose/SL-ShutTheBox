"use client";

/**
 * A team's badge. A fixed palette rather than a free text field: this is filled
 * in on a phone by somebody who has never seen the app, and "pick one of these"
 * takes a second where "type an emoji" takes a trip to the keyboard's emoji
 * panel and back.
 */
const CHOICES = [
  "🦊", "🦉", "🐻", "🐙", "🦁", "🐝", "🦄", "🐢",
  "🦈", "🐸", "🦩", "🐧", "🎲", "🚀", "⚡", "🔥",
] as const;

export const DEFAULT_EMOJI: string = CHOICES[0];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Team badge" className="flex flex-wrap gap-1.5">
      {CHOICES.map((emoji) => {
        const active = emoji === value;
        return (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={emoji}
            onClick={() => onChange(emoji)}
            className={`flex size-11 items-center justify-center rounded-[var(--radius-control)] border text-xl transition-colors ${
              active ? "border-brass bg-brass/20" : "border-line hover:border-brass/60"
            }`}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        );
      })}
    </div>
  );
}
