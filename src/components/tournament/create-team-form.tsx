"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_EMOJI } from "@/components/tournament/emoji-picker";
import { rememberMyTeam } from "@/components/tournament/my-team";
import { TeamFields, type TeamFieldValues } from "@/components/tournament/team-fields";
import { createTeam } from "@/app/(public)/t/actions";
import type { TournamentSnapshot } from "@/lib/tournament";

const EMPTY: TeamFieldValues = { name: "", emoji: DEFAULT_EMOJI, songUrl: "" };

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
  const [values, setValues] = useState<TeamFieldValues>(EMPTY);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function submit() {
    const name = values.name.trim();
    if (!name) {
      toast({ kind: "error", title: "Give the team a name first" });
      return;
    }
    startTransition(async () => {
      const res = await createTeam(code, {
        name,
        emoji: values.emoji,
        songUrl: values.songUrl.trim() || null,
      });
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
      setValues(EMPTY);
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

      <TeamFields
        values={values}
        onChange={setValues}
        songHint="A YouTube link. It plays if your team wins."
      />

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add the team 🎲"}
      </Button>
    </form>
  );
}
