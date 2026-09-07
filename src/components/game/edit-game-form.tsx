"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Board } from "@/components/board/board";
import { MiniBoard } from "@/components/board/mini-board";
import { ScoreReadout } from "@/components/board/score-readout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { boardTiles, maxScoreOf, scoreOf, tilesOf, type Ruleset } from "@/lib/rules";
import type { Player } from "@/lib/types";
import {
  deleteGame,
  editGame,
  undoLastChange,
  type ResultInput,
} from "@/app/(focus)/game/[id]/edit/actions";

export type EditableRow = {
  playerId: string;
  name: string;
  emoji: string;
  status: "done" | "dnp";
  score: number | null;
  tilesOpen: number[] | null;
};

/**
 * Correcting a game that has already been crowned.
 *
 * This is the screen that replaces opening the Supabase dashboard. Ratings,
 * badges and streaks all move when it saves, and the change goes into the
 * history with the name of whoever made it.
 */
export function EditGameForm({
  gameId,
  rules,
  playedOn,
  rows: initialRows,
  roster,
  today,
}: {
  gameId: string;
  rules: Ruleset;
  playedOn: string;
  rows: EditableRow[];
  roster: Player[];
  today: string;
}) {
  const [date, setDate] = useState(playedOn);
  const [rows, setRows] = useState<EditableRow[]>(initialRows);
  const [note, setNote] = useState("");
  const [editingTiles, setEditingTiles] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"delete" | "remove" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const tiles = boardTiles(rules);
  const notInGame = roster.filter(
    (p) => !rows.some((r) => r.playerId === p.id),
  );

  function setRow(playerId: string, patch: Partial<EditableRow>) {
    setRows((prev) =>
      prev.map((r) => (r.playerId === playerId ? { ...r, ...patch } : r)),
    );
  }

  function save() {
    startTransition(async () => {
      const results: ResultInput[] = rows.map((r) => ({
        playerId: r.playerId,
        status: r.status,
        score: r.score,
        tilesOpen: r.tilesOpen,
      }));
      const res = await editGame(gameId, date, results, note);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      toast({
        kind: "success",
        title: "Saved",
        body: "Ratings and badges have been settled again.",
      });
      setNote("");
      router.push(`/game/${gameId}`);
    });
  }

  function undo() {
    startTransition(async () => {
      const res = await undoLastChange(gameId);
      toast(
        res.ok
          ? { kind: "success", title: "Put back as it was" }
          : { kind: "error", title: res.error },
      );
      router.refresh();
    });
  }

  function remove() {
    setConfirming(null);
    startTransition(async () => {
      const res = await deleteGame(gameId, note);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      toast({
        kind: "info",
        title: "Game deleted",
        body: "It no longer counts. You can restore it from the game page.",
      });
      router.push("/");
    });
  }

  // --- correcting one player's board ---------------------------------------
  if (editingTiles) {
    const row = rows.find((r) => r.playerId === editingTiles)!;
    const down = new Set(tiles.filter((t) => !(row.tilesOpen ?? []).includes(t)));
    const open = tiles.filter((t) => !down.has(t));

    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
          {row.emoji} {row.name}
        </h2>
        <Board
          rules={rules}
          down={down}
          onToggle={(tile) => {
            const nextOpen = open.includes(tile)
              ? open.filter((t) => t !== tile)
              : [...open, tile].sort((a, b) => a - b);
            setRow(row.playerId, {
              tilesOpen: nextOpen,
              score: scoreOf(rules, nextOpen),
              status: "done",
            });
          }}
        />
        <ScoreReadout
          rules={rules}
          value={scoreOf(rules, open)}
          shut={open.length === 0}
          label="Corrected score"
        />
        <Button onClick={() => setEditingTiles(null)}>Done</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <label htmlFor="played-on" className="eyebrow">
          Played on
        </label>
        <input
          id="played-on"
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="w-48 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2"
        />
        {date !== playedOn && (
          <p className="text-xs text-ink-muted">
            Moving the date moves the game in the history, and into whichever
            season contains that day.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="eyebrow">Scores</h2>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.playerId}
              className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-line px-4 py-3"
            >
              <span aria-hidden>{row.emoji}</span>
              <span className="min-w-24 font-medium">{row.name}</span>

              {row.status === "dnp" ? (
                <span className="flex-1 text-sm text-ink-muted">
                  never got a turn
                </span>
              ) : (
                <>
                  <MiniBoard tiles={tilesOf(rules)} open={row.tilesOpen} />
                  <span className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums">
                    {row.score ?? "—"}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setEditingTiles(row.playerId)}
                  >
                    Tiles
                  </Button>
                </>
              )}

              <button
                type="button"
                aria-label={`Remove ${row.name} from this game`}
                onClick={() => {
                  setRemoving(row.playerId);
                  setConfirming("remove");
                }}
                className="ml-auto flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 aria-hidden size={16} />
              </button>
            </li>
          ))}
        </ul>

        {/* A player who was at the table but never got entered. */}
        {notInGame.length > 0 && (
          <div className="flex flex-col gap-2">
            {adding ? (
              <div className="flex flex-wrap gap-2">
                {notInGame.map((p) => (
                  <Button
                    key={p.id}
                    variant="secondary"
                    onClick={() => {
                      setRows((prev) => [
                        ...prev,
                        {
                          playerId: p.id,
                          name: p.name,
                          emoji: p.emoji,
                          status: "done",
                          score: maxScoreOf(rules),
                          tilesOpen: tiles,
                        },
                      ]);
                      setAdding(false);
                    }}
                  >
                    {p.emoji} {p.name}
                  </Button>
                ))}
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
                <Plus aria-hidden size={16} /> Add a forgotten player
              </button>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="note" className="eyebrow">
          Why (optional)
        </label>
        <input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Alice misread her board"
          className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm"
        />
        <p className="text-xs text-ink-muted">
          Goes into the history with your name. Fixing the record is fine —
          hiding that you fixed it is not.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={pending || rows.length === 0} onClick={save}>
          {pending ? "Saving…" : "Save corrections"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={undo}>
          Undo last change
        </Button>
      </div>

      <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-danger/40 p-4">
        <h2 className="eyebrow text-danger">Danger zone</h2>
        <p className="text-sm text-ink-muted">
          Deleting stops this game counting towards anybody&apos;s stats. The
          record is kept and can be restored.
        </p>
        <Button
          variant="danger"
          className="self-start"
          disabled={pending}
          onClick={() => setConfirming("delete")}
        >
          Delete this game
        </Button>
      </section>

      <ConfirmDialog
        open={confirming === "delete"}
        title="Delete this game?"
        body="It stops counting immediately. The record is kept, so you can restore it from the game page."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "remove"}
        title="Remove this player from the game?"
        body="Their score will not be saved when you save the corrections."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          setRows((prev) => prev.filter((r) => r.playerId !== removing));
          setRemoving(null);
          setConfirming(null);
        }}
        onCancel={() => {
          setRemoving(null);
          setConfirming(null);
        }}
      />
    </div>
  );
}
