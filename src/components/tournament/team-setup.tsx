"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EmojiPicker } from "@/components/tournament/emoji-picker";
import { MemberList } from "@/components/tournament/member-list";
import { forgetMyTeam } from "@/components/tournament/my-team";
import { deleteTeam, startTeam, updateTeam } from "@/app/(public)/t/actions";
import type { TournamentSnapshot, TournamentTeam } from "@/lib/tournament";
import type { Ruleset } from "@/lib/rules";

/**
 * A team before it starts rolling — and again whenever somebody joins late,
 * because a team's status is derived and adding a player re-opens it.
 */
export function TeamSetup({
  code,
  team,
  rules,
  onSnapshot,
}: {
  code: string;
  team: TournamentTeam;
  rules: Ruleset;
  onSnapshot: (snapshot: TournamentSnapshot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [emoji, setEmoji] = useState(team.emoji);
  const [songUrl, setSongUrl] = useState(team.song_url ?? "");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const unplayed = team.members.filter((m) => m.score === null).length;
  const resuming = team.played_count > 0;

  function save() {
    startTransition(async () => {
      const res = await updateTeam(code, team.id, {
        name: name.trim() || team.name,
        emoji,
        songUrl: songUrl.trim() || null,
      });
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
      setEditing(false);
      toast({ kind: "success", title: "Saved" });
    });
  }

  function start() {
    startTransition(async () => {
      const res = await startTeam(code, team.id);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
    });
  }

  function handleDelete() {
    setConfirming(false);
    startTransition(async () => {
      const res = await deleteTeam(code, team.id);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      forgetMyTeam(code);
      router.push(`/t/${code}`);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold">
          <span aria-hidden className="text-3xl">
            {team.emoji}
          </span>
          <span className="truncate">{team.name}</span>
        </h1>
        <Button variant="ghost" onClick={() => setEditing((was) => !was)}>
          {editing ? "Close" : "Edit team"}
        </Button>
      </div>

      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4"
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Team name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              autoComplete="off"
              className="min-h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-base"
            />
          </label>

          <EmojiPicker value={emoji} onChange={setEmoji} />

          <label className="flex flex-col gap-1 text-sm font-medium">
            Victory song{" "}
            <span className="font-normal text-ink-muted">(optional)</span>
            <input
              value={songUrl}
              onChange={(event) => setSongUrl(event.target.value)}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://youtu.be/…"
              className="min-h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-base"
            />
            <span className="text-xs text-ink-muted">
              You can still set this while you play — it only matters if you win.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {!resuming && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Delete this team
              </Button>
            )}
          </div>
        </form>
      )}

      <MemberList
        code={code}
        team={team}
        rules={rules}
        onSnapshot={onSnapshot}
        heading={resuming ? "The team" : "Who is playing?"}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={pending || unplayed === 0} onClick={start}>
          {pending
            ? "Starting…"
            : resuming
              ? "Play the next round 🎲"
              : "Start playing 🎲"}
        </Button>
        <Link href={`/t/${code}`} className={buttonClass("ghost")}>
          ‹ Lobby
        </Link>
      </div>

      {unplayed === 0 && (
        <p className="text-sm text-ink-muted">
          Add at least one player before you start.
        </p>
      )}

      <p className="text-xs text-ink-muted">
        One phone per team keeps the score. Everybody else can watch the lobby.
      </p>

      <ConfirmDialog
        open={confirming}
        title="Delete this team?"
        body="Only possible before anybody has rolled."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
