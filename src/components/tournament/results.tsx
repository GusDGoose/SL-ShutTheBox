"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnthemStage, type Anthem } from "@/components/game/anthem-stage";
import { Button, buttonClass } from "@/components/ui/button";
import { useSfx } from "@/components/ui/audio-provider";
import { DeleteTournamentButton } from "@/components/tournament/delete-tournament-button";
import { MemberScore } from "@/components/tournament/member-score";
import { ShareButton } from "@/components/tournament/share-button";
import { resolveClip } from "@/lib/audio/clip-source";
import { burst } from "@/lib/confetti";
import { tilesOf } from "@/lib/rules";
import {
  didNotFinish,
  formatAverage,
  formatTeamDetail,
  rankedTeams,
  winnerTitle,
  winningTeams,
  type TournamentSnapshot,
  type TournamentTeam,
} from "@/lib/tournament";

/**
 * A team's song, in the shape the anthem stage already understands.
 *
 * Teams are not players, so there is nothing to upload against and no trim to
 * store — a YouTube link is the whole feature. resolveClip takes the fields
 * structurally, so this needs no change to the clip code at all.
 */
function clipFor(team: TournamentTeam) {
  return resolveClip({
    id: team.id,
    song_url: team.song_url,
    song_clip_path: null,
    song_start_seconds: 0,
    song_end_seconds: null,
    song_fade_ms: 1500,
    song_loop: false,
  });
}

/**
 * How the event ends.
 *
 * Same rule as the daily game: a tie plays EVERY winning team's song at the
 * same time, on purpose. And the same mechanism, for the same reason — the
 * anthems are mounted by the crown tap, because a browser will not let a page
 * make noise until somebody has touched it.
 */
export function Results({
  snapshot,
  canOrganize,
}: {
  snapshot: TournamentSnapshot;
  canOrganize: boolean;
}) {
  const [crowned, setCrowned] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { play } = useSfx();

  const { code, rules, name } = snapshot.tournament;
  const tiles = tilesOf(rules);
  const ranked = rankedTeams(snapshot);
  const unranked = didNotFinish(snapshot);
  const winners = winningTeams(snapshot);

  useEffect(() => {
    const timers = [
      setTimeout(() => burst({ x: 0.2, y: 0.6 }), 200),
      setTimeout(() => burst({ x: 0.8, y: 0.6 }), 500),
    ];
    heading.current?.focus();
    return () => timers.forEach(clearTimeout);
  }, []);

  // Only teams that HAVE a song go to the stage. Its own "no song yet" copy
  // links to /players, which is a page a guest at a team day cannot reach.
  const anthems: Anthem[] = [];
  const withoutSongs: TournamentTeam[] = [];
  for (const team of winners) {
    const clip = clipFor(team);
    if (clip) {
      anthems.push({
        playerId: team.id,
        name: team.name,
        emoji: team.emoji,
        clip,
        songUrl: team.song_url,
      });
    } else {
      withoutSongs.push(team);
    }
  }

  function crown() {
    setCrowned(true);
    play("fanfare");
    burst({ x: 0.5, y: 0.4 });
    setTimeout(() => burst({ x: 0.3, y: 0.5 }), 300);
    setTimeout(() => burst({ x: 0.7, y: 0.5 }), 600);
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <section className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-brass bg-brass/10 p-6 text-center">
        <div aria-hidden className="text-6xl">
          🏆
        </div>
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{name}</span>
          <h1
            ref={heading}
            tabIndex={-1}
            className="font-[family-name:var(--font-display)] text-3xl font-extrabold outline-none"
          >
            {winnerTitle(winners.map((t) => t.name))}
          </h1>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {winners.map((team) => (
            <span key={team.id} className="text-lg">
              👑 <span aria-hidden>{team.emoji}</span> <strong>{team.name}</strong>{" "}
              <span className="tabular-nums text-ink-muted">
                {formatAverage(team.average)}
              </span>
            </span>
          ))}
        </div>

        {!crowned ? (
          winners.length > 0 && (
            <Button size="lg" onClick={crown}>
              👑 Crown {winners.length > 1 ? "the winners" : "the winner"}
            </Button>
          )
        ) : (
          <div className="flex w-full flex-col items-center gap-4">
            <AnthemStage anthems={anthems} />
            {withoutSongs.map((team) => (
              <p key={team.id} className="text-sm text-ink-muted">
                <span aria-hidden>{team.emoji}</span> {team.name} did not pick a
                song. Next time!
              </p>
            ))}
          </div>
        )}
      </section>

      <ol className="flex flex-col gap-2">
        {ranked.map((team) => (
          <li
            key={team.id}
            className={`flex flex-col gap-2 rounded-[var(--radius-card)] border px-4 py-3 ${
              team.rank === 1 ? "border-brass bg-brass/10" : "border-line"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex min-w-0 items-center gap-2 font-bold">
                <span className="w-6 shrink-0 tabular-nums text-ink-muted">
                  {team.rank}
                </span>
                <span aria-hidden className="text-xl">
                  {team.emoji}
                </span>
                <span className="truncate">{team.name}</span>
                {team.rank === 1 && <span aria-hidden>👑</span>}
              </h2>
              <span className="shrink-0 text-right">
                <span className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">
                  {formatAverage(team.average)}
                </span>
                <span className="block text-xs text-ink-muted">
                  {formatTeamDetail(team)}
                </span>
              </span>
            </div>

            <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-8 text-sm">
              {team.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2">
                  <span className={member.score === null ? "text-ink-muted" : ""}>
                    {member.name}
                  </span>
                  {member.score === null ? (
                    <span className="text-xs text-ink-muted">did not play</span>
                  ) : (
                    <MemberScore member={member} tiles={tiles} />
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {unranked.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Never rolled</h2>
          <ul className="flex flex-col gap-2">
            {unranked.map((team) => (
              <li
                key={team.id}
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-dashed border-line px-4 py-3 text-ink-muted"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>{team.emoji}</span>
                  <span>{team.name}</span>
                </span>
                <span className="text-xs">no score</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <ShareButton
          path={`/t/${code}`}
          title={`${name} — results`}
          label="Share the result"
          variant="primary"
        />
        {canOrganize && (
          <>
            <Link href="/t/new" className={buttonClass("secondary")}>
              New team play
            </Link>
            <DeleteTournamentButton
              code={code}
              body="The results go with it, and the link stops working for everybody. This cannot be undone."
            />
          </>
        )}
      </div>
    </main>
  );
}
