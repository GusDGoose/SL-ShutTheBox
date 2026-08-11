"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { useEffect, useState } from "react";
import { YouTubePlayer } from "./youtube-player";

export type CelebrationWinner = {
  name: string;
  emoji: string;
  streak: number; // current daily-win streak including today
  videoId: string | null; // parsed from the player's song_url
  songUrl: string | null; // raw URL for the "Open on YouTube" fallback
};

function burst(origin: { x: number; y: number }) {
  confetti({ particleCount: 120, spread: 75, origin });
}

export function Celebration({
  winners,
  shutBox,
}: {
  winners: CelebrationWinner[];
  shutBox: boolean;
}) {
  const [crowned, setCrowned] = useState(false);

  // A little confetti on page load…
  useEffect(() => {
    const timers = [
      setTimeout(() => burst({ x: 0.2, y: 0.6 }), 200),
      setTimeout(() => burst({ x: 0.8, y: 0.6 }), 500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // …and the big one on the crown tap, which also unlocks song autoplay.
  function crown() {
    setCrowned(true);
    burst({ x: 0.5, y: 0.4 });
    setTimeout(() => burst({ x: 0.3, y: 0.5 }), 300);
    setTimeout(() => burst({ x: 0.7, y: 0.5 }), 600);
  }

  const title =
    winners.length > 1
      ? `${winners.map((w) => w.name).join(" & ")} share the day!`
      : `${winners[0]?.name} wins the day!`;

  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-950">
      <div className="text-6xl">{shutBox ? "📦" : "🏆"}</div>
      <h2 className="text-2xl font-bold">
        {shutBox && <span className="block text-sm uppercase tracking-widest">Box shut!</span>}
        {title}
      </h2>
      <div className="flex flex-wrap justify-center gap-3">
        {winners.map((w) => (
          <span key={w.name} className="text-lg">
            👑 {w.emoji} <strong>{w.name}</strong>
            {w.streak >= 2 && (
              <span className="ml-1 rounded-full bg-orange-200 px-2 py-0.5 text-sm font-semibold text-orange-900 dark:bg-orange-900 dark:text-orange-100">
                🔥 {w.streak} days running
              </span>
            )}
          </span>
        ))}
      </div>

      {!crowned ? (
        <button
          type="button"
          onClick={crown}
          className="rounded-2xl bg-amber-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition-transform active:scale-95"
        >
          👑 Crown {winners.length > 1 ? "the winners" : "the winner"}
        </button>
      ) : (
        <div className="flex w-full flex-col gap-4">
          {winners.map((w) =>
            w.videoId ? (
              <div key={w.name} className="flex flex-col gap-1">
                {winners.length > 1 && (
                  <p className="text-sm font-medium opacity-70">{w.name}&apos;s anthem</p>
                )}
                <YouTubePlayer videoId={w.videoId} title={`${w.name}'s victory song`} />
                {w.songUrl && (
                  <a
                    href={w.songUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs opacity-60 hover:opacity-100"
                  >
                    Open on YouTube ↗
                  </a>
                )}
              </div>
            ) : (
              <p key={w.name} className="text-sm opacity-70">
                {w.name} has no victory song yet —{" "}
                <Link href="/players" className="underline">
                  set one for next time
                </Link>
                .
              </p>
            ),
          )}
        </div>
      )}
    </section>
  );
}
