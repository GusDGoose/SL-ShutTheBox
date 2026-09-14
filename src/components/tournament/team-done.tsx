"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ScoreKeypad } from "@/components/board/score-keypad";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MemberList } from "@/components/tournament/member-list";
import { MemberScore } from "@/components/tournament/member-score";
import { correctMember } from "@/app/(public)/t/actions";
import { maxScoreOf, tilesOf, type Ruleset } from "@/lib/rules";
import {
  formatAverage,
  formatTeamDetail,
  type TournamentSnapshot,
  type TournamentTeam,
} from "@/lib/tournament";

/**
 * A team that has played everybody.
 *
 * Scores stay correctable until the organiser crowns the event: these are typed
 * in by somebody standing up, holding a phone, with a room talking at them.
 */
export function TeamDone({
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
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const tiles = tilesOf(rules);
  const member = team.members.find((m) => m.id === correcting);

  function save(score: number) {
    if (!correcting) return;
    const memberId = correcting;
    startTransition(async () => {
      const res = await correctMember(code, team.id, memberId, score);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      onSnapshot(res.snapshot);
      setCorrecting(null);
    });
  }

  if (member) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Correcting {member.name}
        </h1>
        <ScoreKeypad max={maxScoreOf(rules)} submitLabel="Save score" onSubmit={save} />
        <Button
          variant="ghost"
          className="self-start"
          disabled={pending}
          onClick={() => setCorrecting(null)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-shut/50 bg-shut/10 p-5 text-center">
        <span aria-hidden className="text-4xl">
          {team.emoji}
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          {team.name} are done
        </h1>
        <p className="text-sm text-ink-muted">Team score</p>
        <p className="font-[family-name:var(--font-display)] text-5xl font-extrabold tabular-nums">
          {formatAverage(team.average)}
        </p>
        <p className="text-sm text-ink-muted">{formatTeamDetail(team)}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="eyebrow">The rounds</h2>
        <ul className="flex flex-col gap-2">
          {team.members
            .filter((m) => m.score !== null)
            .map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setCorrecting(m.id)}
                  className="flex w-full items-center justify-between rounded-[var(--radius-control)] border border-line px-4 py-3 text-left transition-colors hover:border-brass/60"
                >
                  <span className="truncate font-medium">{m.name}</span>
                  <MemberScore member={m} tiles={tiles} size="lg" />
                </button>
              </li>
            ))}
        </ul>
        <p className="text-xs text-ink-muted">Tap a round to fix its score.</p>
      </section>

      {/* Adding somebody re-opens the team, because its status is derived from
          whether everybody has a score rather than stored. */}
      <MemberList
        code={code}
        team={team}
        rules={rules}
        onSnapshot={onSnapshot}
        heading="Somebody else wants a go?"
      />

      <Link href={`/t/${code}`} className={`${buttonClass("primary")} self-start`}>
        ‹ Back to the lobby
      </Link>

      <p className="text-xs text-ink-muted">
        Waiting for the other teams. This turns into the result as soon as the
        event is crowned.
      </p>
    </div>
  );
}
