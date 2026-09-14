"use client";

import Link from "next/link";
import { MiniBoard } from "@/components/board/mini-board";
import { buttonClass } from "@/components/ui/button";
import { formatAverage, liveMember, type TournamentTeam } from "@/lib/tournament";
import { tilesOf, type Ruleset } from "@/lib/rules";

const PILL: Record<TournamentTeam["status"], { text: string; className: string }> = {
  forming: { text: "Getting ready", className: "border-line text-ink-muted" },
  playing: { text: "Playing", className: "border-brass bg-brass/15 text-ink" },
  done: { text: "Done", className: "border-shut/50 bg-shut/10 text-shut-ink" },
};

/**
 * One team, as the lobby shows it — on a phone, and on a projector.
 *
 * The average is the headline because the average is the score: a team of two
 * is not beaten by a team of four simply for being smaller. The sum is there
 * underneath for whoever wants to argue about it.
 */
export function TeamCard({
  team,
  rules,
  code,
  isMine,
}: {
  team: TournamentTeam;
  rules: Ruleset;
  code: string;
  /** This phone created the team, so it is the one keeping its score. */
  isMine: boolean;
}) {
  const pill = PILL[team.status];
  const up = liveMember(team);
  const tiles = tilesOf(rules);

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-lg font-bold">
          <span aria-hidden className="text-2xl">
            {team.emoji}
          </span>
          <span className="truncate">{team.name}</span>
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${pill.className}`}
        >
          {pill.text}
        </span>
      </div>

      {team.status === "playing" && up && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{up.name}</span>
          <span className="text-ink-muted">is up</span>
          {team.live && (
            <>
              <MiniBoard tiles={tiles} open={team.live.tiles_open} />
              <span className="tabular-nums text-ink-muted">
                {team.live.is_shut ? "📦 shut!" : team.live.score_if_stop}
              </span>
            </>
          )}
        </p>
      )}

      {team.member_count === 0 ? (
        <p className="text-sm text-ink-muted">Nobody added yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {team.members.map((member) => (
            <li
              key={member.id}
              className={`flex items-center justify-between gap-2 ${
                member.score === null ? "text-ink-muted" : ""
              }`}
            >
              <span className="truncate">{member.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                {member.score !== null && (
                  <MiniBoard tiles={tiles} open={member.tiles_open} />
                )}
                <span className="tabular-nums">
                  {member.score === null
                    ? "—"
                    : member.score === 0
                      ? "📦 0"
                      : member.score}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <span className="eyebrow">Team score</span>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">
            {formatAverage(team.average)}
            {team.played_count > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-muted">
                {team.sum} over {team.played_count}
                {team.played_count === 1 ? " player" : " players"}
              </span>
            )}
          </p>
        </div>
        <Link
          href={`/t/${code}/team/${team.id}`}
          className={buttonClass(isMine ? "primary" : "ghost")}
        >
          {isMine
            ? "Back to your board"
            : team.status === "forming"
              ? "Set this team up"
              : "Open this board"}
        </Link>
      </div>
    </li>
  );
}
