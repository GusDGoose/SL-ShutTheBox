"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { MemberList } from "@/components/tournament/member-list";
import { forgetMyTeam } from "@/components/tournament/my-team";
import { TeamFields, type TeamFieldValues } from "@/components/tournament/team-fields";
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
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const unplayed = team.members.filter((m) => m.score === null).length;
  const resuming = team.played_count > 0;

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

      {/* Mounted only while open, so it always starts from what the server
          has now — not from whatever was typed before "Close". */}
      {editing && (
        <EditTeamForm
          code={code}
          team={team}
          canDelete={!resuming}
          onSnapshot={onSnapshot}
          onSaved={() => setEditing(false)}
        />
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
    </div>
  );
}

function EditTeamForm({
  code,
  team,
  canDelete,
  onSnapshot,
  onSaved,
}: {
  code: string;
  team: TournamentTeam;
  canDelete: boolean;
  onSnapshot: (snapshot: TournamentSnapshot) => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<TeamFieldValues>({
    name: team.name,
    emoji: team.emoji,
    songUrl: team.song_url ?? "",
  });
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function save() {
    startTransition(async () => {
      const res = await updateTeam(code, team.id, {
        name: values.name.trim() || team.name,
        emoji: values.emoji,
        songUrl: values.songUrl.trim() || null,
      });
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
      toast({ kind: "success", title: "Saved" });
      onSaved();
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <TeamFields
        values={values}
        onChange={setValues}
        songHint="You can still set this while you play — it only matters if you win."
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {canDelete && (
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
            Delete this team
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete this team?"
        body="Only possible before anybody has rolled."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </form>
  );
}
