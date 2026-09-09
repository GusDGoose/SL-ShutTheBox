"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Player } from "@/lib/types";
import { buttonClass } from "@/components/ui/button";
import { SongClipEditor } from "@/components/players/song-clip-editor";
import {
  createPlayer,
  togglePlayerActive,
  updatePlayer,
  type PlayerFormState,
} from "./actions";

const inputCls =
  "rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus-visible:border-brass";

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
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
        Name
        <input name="name" required placeholder="New colleague" className={inputCls} />
      </label>
      <label className="flex w-16 flex-col gap-1 text-xs font-medium text-ink-muted">
        Emoji
        <input name="emoji" placeholder="🎲" className={inputCls} />
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
        Victory song (YouTube URL)
        <input name="song_url" placeholder="https://youtu.be/…" className={inputCls} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Adding…" : "Add player"}
      </button>
      {state.error && (
        <p role="alert" className="w-full text-sm font-semibold text-danger">
          {state.error}
        </p>
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
    <li
      className={`flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 ${
        player.is_active ? "" : "opacity-60"
      }`}
    >
      <form action={formAction} className="flex flex-wrap items-center gap-3">
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
          className={buttonClass("secondary")}
        >
          {pending ? "Saving…" : state.ok ? "Saved ✓" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => togglePlayerActive(player.id, !player.is_active)}
          className={buttonClass("ghost")}
        >
          {player.is_active ? "Bench" : "Reactivate"}
        </button>
        <Link
          href={`/players/${player.id}`}
          className="ml-auto text-sm font-semibold text-ink-muted underline hover:text-ink"
        >
          Profile →
        </Link>
        {state.error && (
          <p role="alert" className="w-full text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
      </form>

      <SongClipEditor player={player} />
    </li>
  );
}
