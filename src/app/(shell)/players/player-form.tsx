"use client";

import { useActionState, useState, useTransition } from "react";
import type { Player } from "@/lib/types";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createPlayer,
  togglePlayerActive,
  updatePlayer,
  type PlayerFormState,
} from "./actions";

const inputCls =
  "rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus-visible:border-brass";

/**
 * A new colleague: a name and an emoji. Their song is theirs to set, on their
 * own profile, once they have said who they are.
 */
export function AddPlayerForm() {
  // [concept: useActionState] Binds a Server Action to form state — submit
  // runs on the server, and `state.error` / `state.ok` re-render this form.
  const [state, formAction, pending] = useActionState<PlayerFormState, FormData>(
    createPlayer,
    {},
  );

  return (
    // Keyed on the success stamp: a new key remounts the form with empty
    // inputs, which is how "the form clears after adding" is done without an
    // effect. v1 left the previous colleague's name sitting in the box.
    <form
      key={state.key ?? 0}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
        Name
        <input name="name" required placeholder="New colleague" className={inputCls} />
      </label>
      <label className="flex w-16 flex-col gap-1 text-xs font-medium text-ink-muted">
        Emoji
        <input name="emoji" placeholder="🎲" className={inputCls} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Adding…" : "Add player"}
      </button>
      {state.ok && (
        <p role="status" className="w-full text-sm text-ink-muted">
          Added. Pick your name from the header, then set your song on your profile.
        </p>
      )}
      {state.error && (
        <p role="alert" className="w-full text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Your name, emoji and song link — on your own profile only. */
export function ProfileForm({ player }: { player: Player }) {
  const updateWithId = updatePlayer.bind(null, player.id);
  const [state, formAction, pending] = useActionState<PlayerFormState, FormData>(
    updateWithId,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-16 flex-col gap-1 text-xs font-medium text-ink-muted">
          Emoji
          <input
            name="emoji"
            defaultValue={player.emoji}
            className={`${inputCls} text-center`}
          />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
          Name
          <input name="name" defaultValue={player.name} required className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
        Victory song (YouTube link)
        <input
          name="song_url"
          defaultValue={player.song_url ?? ""}
          placeholder="https://youtu.be/…"
          className={inputCls}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {pending ? "Saving…" : state.ok ? "Saved ✓" : "Save"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * Benching keeps a player's history but takes them off the picker and the
 * fika rota. Anyone with the PIN can do it, from any profile — it is looking
 * after the roster — but it asks first.
 */
export function BenchToggle({ player, isMe }: { player: Player; isMe: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const benching = player.is_active;

  function confirm() {
    setConfirming(false);
    setError(null);
    startTransition(async () => {
      const res = await togglePlayerActive(player.id, !player.is_active);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
        {benching ? `Bench ${player.name}` : `Bring ${player.name} back`}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title={benching ? `Bench ${player.name}?` : `Bring ${player.name} back?`}
        body={
          benching
            ? `${player.name} comes off the picker and the fika rota. Their games and badges stay.${
                isMe ? " This device stops being you until you are brought back." : ""
              }`
            : `${player.name} goes back on the picker and the fika rota.`
        }
        confirmLabel={benching ? "Bench" : "Bring back"}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
