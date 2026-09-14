"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { MiniBoard } from "@/components/board/mini-board";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addMember, removeMember } from "@/app/(public)/t/actions";
import type { TournamentSnapshot, TournamentTeam } from "@/lib/tournament";
import { tilesOf, type Ruleset } from "@/lib/rules";

/**
 * Who is in the team, and in what order they roll.
 *
 * Names only — these people are not on the roster and never will be. A name is
 * enough to read out and enough to put a score against, which is the whole job.
 */
export function MemberList({
  code,
  team,
  rules,
  onSnapshot,
  addLabel = "Add",
  heading,
}: {
  code: string;
  team: TournamentTeam;
  rules: Ruleset;
  onSnapshot: (snapshot: TournamentSnapshot) => void;
  addLabel?: string;
  heading?: string;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const tiles = tilesOf(rules);
  const liveId = team.live?.member_id ?? null;

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await addMember(code, team.id, trimmed);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
      setName("");
    });
  }

  function remove(memberId: string) {
    startTransition(async () => {
      const res = await removeMember(code, team.id, memberId);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      {heading && <h2 className="eyebrow">{heading}</h2>}

      {team.members.length > 0 && (
        <ol className="flex flex-col gap-2">
          {team.members.map((member, index) => {
            const played = member.score !== null;
            const up = member.id === liveId;
            return (
              <li
                key={member.id}
                className={`flex items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 py-2 ${
                  up ? "border-brass bg-brass/10" : "border-line"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs text-ink-muted tabular-nums">
                    {index + 1}
                  </span>
                  <span className="truncate font-medium">{member.name}</span>
                  {up && <span className="shrink-0 text-xs text-ink-muted">up now</span>}
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  {played ? (
                    <>
                      <MiniBoard tiles={tiles} open={member.tiles_open} />
                      <span className="font-[family-name:var(--font-display)] font-bold tabular-nums">
                        {member.score === 0 ? "📦 0" : member.score}
                      </span>
                    </>
                  ) : (
                    // Only somebody who has not rolled can go, and never the
                    // one standing at the board — the database refuses both,
                    // so the button simply is not offered.
                    !up && (
                      <button
                        type="button"
                        aria-label={`Remove ${member.name}`}
                        disabled={pending}
                        onClick={() => remove(member.id)}
                        className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-danger"
                      >
                        <X aria-hidden size={16} />
                      </button>
                    )
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          autoComplete="off"
          aria-label="Player name"
          placeholder="Name"
          className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-base"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {addLabel}
        </Button>
      </form>
    </section>
  );
}
