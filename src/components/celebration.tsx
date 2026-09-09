"use client";

import confetti from "canvas-confetti";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSfx } from "@/components/ui/audio-provider";
import { useToast } from "@/components/ui/toast";
import { AnthemStage, type Anthem } from "@/components/game/anthem-stage";
import type { ClipSource } from "@/lib/audio/clip-source";

export type CelebrationWinner = {
  playerId: string;
  name: string;
  emoji: string;
  streak: number; // current daily-win streak, including today
  clip: ClipSource | null; // null when they have no song set, or it will not parse
  songUrl: string | null; // raw URL, for the "open on YouTube" fallback
};

export type EarnedBadge = {
  player_id: string;
  key: string;
  name: string;
  emoji: string;
  description: string;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function burst(origin: { x: number; y: number }) {
  if (prefersReducedMotion()) return;
  confetti({ particleCount: 120, spread: 75, origin });
}

export function Celebration({
  winners,
  shutBox,
  badges = [],
  playerNames = {},
}: {
  winners: CelebrationWinner[];
  shutBox: boolean;
  badges?: EarnedBadge[];
  playerNames?: Record<string, string>;
}) {
  const [crowned, setCrowned] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { play } = useSfx();
  const toast = useToast();

  useEffect(() => {
    const timers = [
      setTimeout(() => burst({ x: 0.2, y: 0.6 }), 200),
      setTimeout(() => burst({ x: 0.8, y: 0.6 }), 500),
    ];
    // Focus moves here so the result is the first thing a screen reader reaches.
    heading.current?.focus();
    return () => timers.forEach(clearTimeout);
  }, []);

  // Badges land one at a time, so three at once do not become one blur.
  useEffect(() => {
    if (badges.length === 0) return;
    const timers = badges.map((badge, index) =>
      setTimeout(
        () => {
          play("badge");
          toast({
            kind: "badge",
            title: `${badge.emoji} ${badge.name}`,
            body: `${playerNames[badge.player_id] ?? "Someone"} — ${badge.description}`,
          });
        },
        1200 + index * 1500,
      ),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * [concept: autoplay needs the gesture] The anthems are mounted BY this
   * click, not on page load. A browser will not let a page make noise until
   * somebody has interacted with it, and mounting the players inside the tap is
   * what makes the songs actually play.
   */
  function crown() {
    setCrowned(true);
    play("fanfare");
    burst({ x: 0.5, y: 0.4 });
    setTimeout(() => burst({ x: 0.3, y: 0.5 }), 300);
    setTimeout(() => burst({ x: 0.7, y: 0.5 }), 600);
  }

  // "Alice & Bob & Charlie" reads like a law firm; three or more take commas.
  const names = winners.map((w) => w.name);
  const shared =
    names.length > 2
      ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`
      : names.join(" & ");
  const title =
    winners.length > 1 ? `${shared} share the day!` : `${names[0]} wins the day!`;

  const anthems: Anthem[] = winners.map((w) => ({
    playerId: w.playerId,
    name: w.name,
    emoji: w.emoji,
    clip: w.clip,
    songUrl: w.songUrl,
  }));

  return (
    <section className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-brass bg-brass/10 p-6 text-center">
      <div aria-hidden className="text-6xl">
        {shutBox ? "📦" : "🏆"}
      </div>

      <h2
        ref={heading}
        tabIndex={-1}
        className="font-[family-name:var(--font-display)] text-3xl font-extrabold outline-none"
      >
        {shutBox && <span className="eyebrow block">Box shut!</span>}
        {title}
      </h2>

      <div className="flex flex-wrap justify-center gap-3">
        {winners.map((w) => (
          <span key={w.playerId} className="text-lg">
            👑 {w.emoji} <strong>{w.name}</strong>
            {w.streak >= 2 && (
              <span className="ml-1 rounded-full bg-streak/20 px-2 py-0.5 text-sm font-semibold text-streak">
                🔥 {w.streak} days running
              </span>
            )}
          </span>
        ))}
      </div>

      {!crowned ? (
        <Button size="lg" onClick={crown}>
          👑 Crown {winners.length > 1 ? "the winners" : "the winner"}
        </Button>
      ) : (
        <div className="flex w-full flex-col items-center gap-4">
          <AnthemStage anthems={anthems} />
        </div>
      )}
    </section>
  );
}
