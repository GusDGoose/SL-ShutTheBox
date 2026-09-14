"use client";

import { inputClass } from "@/components/ui/input";
import { EmojiPicker } from "@/components/tournament/emoji-picker";

export type TeamFieldValues = { name: string; emoji: string; songUrl: string };

/**
 * Name, badge and song — the three things a team is. Shared by the form that
 * creates one and the form that edits one, so they cannot drift apart.
 */
export function TeamFields({
  values,
  onChange,
  songHint,
}: {
  values: TeamFieldValues;
  onChange: (next: TeamFieldValues) => void;
  songHint: string;
}) {
  const set = (patch: Partial<TeamFieldValues>) => onChange({ ...values, ...patch });

  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Team name
        <input
          value={values.name}
          onChange={(event) => set({ name: event.target.value })}
          maxLength={40}
          autoComplete="off"
          placeholder="The Sixes"
          className={inputClass}
        />
      </label>

      <EmojiPicker value={values.emoji} onChange={(emoji) => set({ emoji })} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Victory song <span className="font-normal text-ink-muted">(optional)</span>
        <input
          value={values.songUrl}
          onChange={(event) => set({ songUrl: event.target.value })}
          // A text keyboard, not a URL one: inputMode="url" hides the colon on
          // some phones, the same trap the song clip fields once fell into.
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://youtu.be/…"
          className={inputClass}
        />
        <span className="text-xs text-ink-muted">{songHint}</span>
      </label>
    </>
  );
}
