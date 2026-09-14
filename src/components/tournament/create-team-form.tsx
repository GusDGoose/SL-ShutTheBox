"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_EMOJI,
  EmojiPicker,
} from "@/components/tournament/emoji-picker";
import { rememberMyTeam } from "@/components/tournament/my-team";
import { createTeam } from "@/app/(public)/t/actions";
import type { TournamentSnapshot } from "@/lib/tournament";

/**
 * The first thing a team's phone does.
 *
 * On success it goes STRAIGHT to that team's board rather than back to the
 * lobby: the person holding this phone is the one who will keep score, and one
 * fewer tap is one fewer thing to explain to a room.
 */
export function CreateTeamForm({
  code,
  onSnapshot,
}: {
  code: string;
  onSnapshot: (snapshot: TournamentSnapshot) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string>(DEFAULT_EMOJI);
  const [songUrl, setSongUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ kind: "error", title: "Give the team a name first" });
      return;
    }
    startTransition(async () => {
      const res = await createTeam(code, {
        name: trimmed,
        emoji,
        songUrl: songUrl.trim() || null,
      });
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
      setName("");
      setSongUrl("");
      if (res.teamId) {
        rememberMyTeam(code, res.teamId);
        router.push(`/t/${code}/team/${res.teamId}`);
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Add your team</h2>
        <p className="text-sm text-ink-muted">
          One phone per team. Whoever fills this in keeps the score.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Team name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          autoComplete="off"
          placeholder="The Sixes"
          className="min-h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-base"
        />
      </label>

      <EmojiPicker value={emoji} onChange={setEmoji} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Victory song <span className="font-normal text-ink-muted">(optional)</span>
        <input
          value={songUrl}
          onChange={(event) => setSongUrl(event.target.value)}
          // A text keyboard, not a URL one: inputMode="url" hides the colon on
          // some phones, which is the same trap the song clip fields fell into.
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://youtu.be/…"
          className="min-h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-base"
        />
        <span className="text-xs text-ink-muted">
          A YouTube link. It plays if your team wins.
        </span>
      </label>

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add the team 🎲"}
      </Button>
    </form>
  );
}
