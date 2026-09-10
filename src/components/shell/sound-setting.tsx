"use client";

import { useSfx } from "@/components/ui/audio-provider";
import { buttonClass } from "@/components/ui/button";

/**
 * The same per-device mute as the speaker in the header, spelled out.
 *
 * The icon in the rail is for silencing your phone mid-game without losing
 * your place; this is for the person who went looking for the setting. They
 * read the one store, so they can never disagree.
 */
export function SoundSetting() {
  const { muted, setMuted, play } = useSfx();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">Sound</h2>
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="sfx"
            className="flex cursor-pointer items-center gap-3 font-semibold"
          >
            <input
              id="sfx"
              type="checkbox"
              checked={!muted}
              onChange={(e) => {
                setMuted(!e.target.checked);
                // Turning it on is a gesture, so it can also prove itself.
                if (e.target.checked) play("tileDown");
              }}
              className="size-5 accent-[var(--color-brass)]"
            />
            Tile clacks and fanfares
          </label>
          <p className="mt-1 text-xs text-ink-muted">
            This device only — one game should not be six clacking phones.
          </p>
        </div>
        <button
          type="button"
          onClick={() => play("fanfare")}
          disabled={muted}
          className={buttonClass("secondary")}
        >
          Test 🔊
        </button>
      </div>
    </section>
  );
}
