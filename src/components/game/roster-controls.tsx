"use client";

import { useState, useTransition } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { LiveSnapshot } from "@/lib/live";
import type { Player } from "@/lib/types";
import { joinGame, leaveGame } from "@/app/(focus)/game/actions";

type RosterPlayer = {
  player_id: string;
  name: string;
  emoji: string;
  status: "pending" | "playing" | "done" | "dnp";
};

/**
 * Who is at the table, changeable while the game is on.
 *
 * Scorekeeper only, like everything that changes a live game. A late arrival is
 * added from the active roster and slots in last; somebody who was picked but
 * is not going to play is removed — only before they have rolled, and they go
 * entirely rather than being marked dnp, which means something else. The
 * database holds those rules (0017); this just shows the right buttons.
 */
export function RosterControls({
  gameId,
  players,
  roster,
  onSnapshot,
}: {
  gameId: string;
  players: RosterPlayer[];
  roster: Player[];
  onSnapshot: (snapshot: LiveSnapshot) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RosterPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inGame = new Set(players.map((p) => p.player_id));
  const candidates = roster.filter((p) => p.is_active && !inGame.has(p.id));
  const waiting = players.filter((p) => p.status === "pending");

  function add(playerId: string) {
    setError(null);
    startTransition(async () => {
      const res = await joinGame(gameId, playerId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAdding(false);
      onSnapshot(res.snapshot);
    });
  }

  function remove() {
    const target = removing;
    setRemoving(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await leaveGame(gameId, target.player_id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSnapshot(res.snapshot);
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="eyebrow">Still to roll</h2>

      {waiting.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {waiting.map((p) => (
            <li
              key={p.player_id}
              className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-3 pr-1 text-sm"
            >
              <span aria-hidden>{p.emoji}</span>
              {p.name}
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                disabled={pending}
                onClick={() => setRemoving(p)}
                className="flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                <UserMinus aria-hidden size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">Nobody is waiting for a turn.</p>
      )}

      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Everyone on the roster is already in.
            </p>
          ) : (
            candidates.map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                disabled={pending}
                aria-label={`Add ${p.name}`}
                onClick={() => add(p.id)}
              >
                <span aria-hidden>{p.emoji}</span> {p.name}
              </Button>
            ))
          )}
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 self-start text-sm font-semibold text-ink-muted hover:text-ink"
        >
          <UserPlus aria-hidden size={16} /> Add a player
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ""} from the game?`}
        body="They were picked but are not going to play. Their spot goes and nothing is recorded for them."
        confirmLabel="Remove"
        danger
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
