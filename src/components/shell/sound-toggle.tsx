"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSfx } from "@/components/ui/audio-provider";

/**
 * Mute, per device. One game should not become six clacking phones, so a
 * spectator can silence their own without affecting the scorekeeper.
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const { muted, setMuted, play } = useSfx();

  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        // Unmuting is a gesture, so this also confirms audio actually works.
        if (!next) play("tileUp");
      }}
      className={`flex size-11 items-center justify-center rounded-full transition-colors hover:bg-black/15 ${className}`}
    >
      {muted ? (
        <VolumeX aria-hidden size={20} />
      ) : (
        <Volume2 aria-hidden size={20} />
      )}
    </button>
  );
}
