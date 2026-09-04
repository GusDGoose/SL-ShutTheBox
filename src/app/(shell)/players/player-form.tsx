"use client";

import { useActionState } from "react";
import type { Player } from "@/lib/types";
import {
  createPlayer,
  togglePlayerActive,
  updatePlayer,
  type PlayerFormState,
} from "./actions";

const inputCls =
  "rounded-lg border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/60 dark:border-white/20 dark:focus:border-white/60";

export function AddPlayerForm() {
  // [concept: useActionState] Binds a Server Action to form state — submit
  // runs on the server, and `state.error` / `state.ok` re-render this form.
  const [state, formAction, pending] = useActionState<PlayerFormState, FormData>(
    createPlayer,
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
    >
      <label className="flex flex-col gap-1 text-xs font-medium opacity-70">
        Name
        <input name="name" required placeholder="New colleague" className={inputCls} />
      </label>
      <label className="flex w-16 flex-col gap-1 text-xs font-medium opacity-70">
        Emoji
        <input name="emoji" placeholder="🎲" className={inputCls} />
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium opacity-70">
        Victory song (YouTube URL)
        <input name="song_url" placeholder="https://youtu.be/…" className={inputCls} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add player"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}

export function PlayerRow({ player }: { player: Player }) {
  const updateWithId = updatePlayer.bind(null, player.id);
  const [state, formAction, pending] = useActionState<PlayerFormState, FormData>(
    updateWithId,
    {},
  );

  return (
    <form
      action={formAction}
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10 ${
        player.is_active ? "" : "opacity-50"
      }`}
    >
      <input
        name="emoji"
        defaultValue={player.emoji}
        className={`${inputCls} w-14 text-center`}
        aria-label="Emoji"
      />
      <input
        name="name"
        defaultValue={player.name}
        required
        className={`${inputCls} w-36`}
        aria-label="Name"
      />
      <input
        name="song_url"
        defaultValue={player.song_url ?? ""}
        placeholder="No victory song yet"
        className={`${inputCls} min-w-56 flex-1`}
        aria-label="Victory song URL"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-black/20 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/20"
      >
        {pending ? "Saving…" : state.ok ? "Saved ✓" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => togglePlayerActive(player.id, !player.is_active)}
        className="rounded-lg px-3 py-2 text-sm opacity-70 hover:opacity-100"
      >
        {player.is_active ? "Bench" : "Reactivate"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
