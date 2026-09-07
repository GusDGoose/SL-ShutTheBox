"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shuffle } from "lucide-react";
import type { Player } from "@/lib/types";
import type { Ruleset } from "@/lib/rules";
import { tilesOf } from "@/lib/rules";
import { PlayerPicker } from "@/components/player-picker";
import { Button } from "@/components/ui/button";
import { useSfx } from "@/components/ui/audio-provider";
import { startGame } from "@/app/(focus)/game/actions";

/**
 * Picking who is playing, and in what order.
 *
 * Unlike v1, pressing the button creates the game in the database rather than
 * in this component's state — so from here on a refresh resumes it and (from
 * WP-B7) other phones can watch.
 */
export function SetupScreen({
  rules,
  players,
  gamesToday,
}: {
  rules: Ruleset;
  players: Player[];
  gamesToday: number;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { play } = useSfx();

  function toggle(id: string) {
    play("tileUp");
    setOrder((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function shuffle() {
    play("endTurn");
    setOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j]!, next[i]!];
      }
      return next;
    });
  }

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await startGame(order);
      if (!res.ok) {
        setError(res.error);
        // Most likely someone else just started one, so show them what is
        // actually going on rather than leaving a stale screen.
        router.refresh();
        return;
      }
      router.push(`/game/${res.gameId}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        New game
      </h1>

      <p className="text-sm text-ink-muted">
        {tilesOf(rules)} tiles ·{" "}
        {rules.win === "lowest" ? "lowest score wins" : "highest score wins"} ·{" "}
        <Link href="/rules" className="font-semibold underline">
          house rules
        </Link>
      </p>

      {gamesToday > 0 && (
        <p className="rounded-[var(--radius-card)] border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
          ⚠️ Today already has {gamesToday === 1 ? "a game" : `${gamesToday} games`}{" "}
          — play another if you like; every game still counts toward the day.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Who&apos;s playing? (tap in turn order)</h2>
        <PlayerPicker players={players} selected={order} onToggle={toggle} />
        {order.length > 1 && (
          <button
            type="button"
            onClick={shuffle}
            className="flex items-center gap-2 self-start text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <Shuffle aria-hidden size={16} /> Shuffle the order
          </button>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <Button
        size="lg"
        className="self-start"
        disabled={order.length === 0 || pending}
        onClick={start}
      >
        {pending ? "Setting up the box…" : "Roll the dice 🎲"}
      </Button>
      {order.length === 0 && (
        <p className="text-xs text-ink-muted">Pick at least one player.</p>
      )}
    </div>
  );
}
