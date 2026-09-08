import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Distribution } from "@/components/stats/distribution";
import { HallOfFame } from "@/components/stats/hall-of-fame";
import { H2HMatrix } from "@/components/stats/h2h-matrix";
import { BarRow } from "@/components/stats/primitives";
import { SeasonNav } from "@/components/stats/season-nav";
import { Cell, StatsRow, StatsTable } from "@/components/stats/stats-table";
import { stockholmToday } from "@/lib/dates";
import {
  getAllTimeStats,
  getBiggestChokes,
  getHallOfFame,
  getHeadToHead,
  getMonthlyChampions,
  getNemeses,
  getRoster,
  getScoreDistribution,
  getSeasonChampions,
  getSeasonForDate,
  getSeasons,
  getStreaks,
} from "@/lib/queries/stats";

export const dynamic = "force-dynamic";

export const metadata = { title: "All-time · Shut the Box" };

/** Everything that has ever happened, and the records that came out of it. */
export default async function AllTimePage() {
  const [
    seasons,
    current,
    stats,
    streaks,
    hall,
    chokes,
    nemeses,
    distribution,
    monthly,
    champions,
    h2h,
    roster,
  ] = await Promise.all([
    getSeasons(),
    getSeasonForDate(stockholmToday()),
    getAllTimeStats(),
    getStreaks(),
    getHallOfFame(),
    getBiggestChokes(),
    getNemeses(),
    getScoreDistribution(),
    getMonthlyChampions(),
    getSeasonChampions(),
    getHeadToHead(),
    getRoster(),
  ]);

  const players = new Map(roster.map((p) => [p.id, p]));
  const streakOf = new Map(streaks.map((s) => [s.player_id, s]));
  const maxWins = Math.max(...stats.map((s) => s.wins), 1);

  // Leaderboard order: most wins, then the lower average breaks the tie.
  const leaderboard = [...stats].sort(
    (a, b) =>
      b.wins - a.wins ||
      Number(a.avg_score ?? 999) - Number(b.avg_score ?? 999),
  );

  // Months, newest first, with ties sharing the title.
  const months = [...new Set(monthly.map((m) => m.month))];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          All-time
        </h1>
        <SeasonNav seasons={seasons} currentId={current.id} active="all-time" />
      </div>

      {leaderboard.length === 0 ? (
        <EmptyState
          art="🎲"
          title="No scores yet — go roll something."
          body="Every table on this page fills itself in from the games you play."
          cta={
            <Link href="/play" className={buttonClass("primary", "lg")}>
              Start a game 🎲
            </Link>
          }
        />
      ) : (
        <>
          {/* ---------------- Leaderboard ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Leaderboard</h2>
            <StatsTable
              caption="All-time leaderboard"
              headers={[
                "Player",
                "Wins",
                "Games",
                "Win %",
                "Avg",
                "Best",
                "📦",
                "🔥 Now",
                "🔥 Best",
              ]}
            >
              {leaderboard.map((s, i) => (
                <StatsRow key={s.player_id} highlight={i === 0}>
                  <Cell header>
                    <span aria-hidden>{s.emoji}</span> {s.name}
                    {!s.is_active && (
                      <span className="ml-1 text-xs text-ink-muted">
                        benched
                      </span>
                    )}
                  </Cell>
                  <Cell>
                    <BarRow value={s.wins} max={maxWins} />
                  </Cell>
                  <Cell num>{s.games_played}</Cell>
                  <Cell num>{s.win_pct === null ? "—" : `${s.win_pct}%`}</Cell>
                  <Cell num>{s.avg_score ?? "—"}</Cell>
                  <Cell num>{s.best_score ?? "—"}</Cell>
                  <Cell num>{s.shut_boxes}</Cell>
                  <Cell num>{streakOf.get(s.player_id)?.current_streak ?? 0}</Cell>
                  <Cell num>{streakOf.get(s.player_id)?.best_streak ?? 0}</Cell>
                </StatsRow>
              ))}
            </StatsTable>
          </section>

          {/* ---------------- Hall of fame ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Hall of fame</h2>
            <HallOfFame rows={hall} players={players} />
          </section>

          {/* ---------------- Season champions ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Season champions</h2>
            {champions.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-6 text-sm text-ink-muted">
                No season has finished yet — the first title is still up for
                grabs.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {champions.map((c) => (
                  <li
                    key={`${c.season_id}-${c.player_id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-control)] border border-line px-4 py-2.5"
                  >
                    <span>
                      <span aria-hidden>🏆</span>{" "}
                      <span aria-hidden>{c.emoji}</span>{" "}
                      <span className="font-medium">{c.name}</span>
                    </span>
                    <span className="text-ink-muted">
                      Season {c.season_number}
                      {/* A season nobody named is called "Season N" already,
                          so printing both would read "Season 1 · Season 1". */}
                      {c.season_name !== `Season ${c.season_number}` &&
                        ` · ${c.season_name}`}{" "}
                      · {c.day_wins} day {c.day_wins === 1 ? "win" : "wins"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------------- Monthly champions ---------------- */}
          {months.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="eyebrow">Monthly champions</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {months.map((month) => {
                  const winners = monthly.filter((m) => m.month === month);
                  const label = new Date(
                    `${month}T12:00:00Z`,
                  ).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <li
                      key={month}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-control)] border border-line px-4 py-2.5"
                    >
                      <span>
                        <span aria-hidden>🏅</span>{" "}
                        {winners.map((w, i) => (
                          <span key={w.player_id}>
                            {i > 0 && " & "}
                            <span aria-hidden>{w.emoji}</span>{" "}
                            <span className="font-medium">{w.name}</span>
                          </span>
                        ))}
                      </span>
                      <span className="text-ink-muted">
                        {label} · {winners[0].day_wins} day{" "}
                        {winners[0].day_wins === 1 ? "win" : "wins"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ---------------- Distribution ---------------- */}
          <Distribution scores={distribution} />

          {/* ---------------- Nemesis ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Nemesis</h2>
            {nemeses.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-6 text-sm text-ink-muted">
                A nemesis needs five meetings before it means anything. Keep
                playing.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {nemeses.map((n) => {
                  const me = players.get(n.player_id);
                  return (
                    <li
                      key={n.player_id}
                      className="rounded-[var(--radius-control)] border border-line px-4 py-2.5"
                    >
                      <span aria-hidden>{me?.emoji}</span>{" "}
                      <span className="font-medium">{me?.name}</span> loses most
                      to <span aria-hidden>{n.nemesis_emoji}</span>{" "}
                      <span className="font-medium">{n.nemesis_name}</span>{" "}
                      <span className="text-ink-muted tabular-nums">
                        ({n.a_wins}–{n.b_wins} in {n.meetings})
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------------- Biggest chokes ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Biggest chokes</h2>
            {chokes.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-6 text-sm text-ink-muted">
                Nobody has thrown one away yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {chokes.map((c) => {
                  const p = players.get(c.player_id);
                  return (
                    <li
                      key={`${c.game_id}-${c.player_id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-control)] border border-line px-4 py-2.5"
                    >
                      <span>
                        <span aria-hidden>😬</span>{" "}
                        <span aria-hidden>{p?.emoji}</span>{" "}
                        <span className="font-medium">{p?.name}</span>
                        {c.was_favourite && (
                          <span className="text-ink-muted">
                            {" "}
                            — favourite, and lost it
                          </span>
                        )}
                      </span>
                      <span className="text-ink-muted tabular-nums">
                        <Link
                          href={`/game/${c.game_id}`}
                          className="underline hover:text-ink"
                        >
                          {c.played_on}
                        </Link>{" "}
                        · {Number(c.delta).toFixed(1).replace("-", "−")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------------- Head to head ---------------- */}
          {leaderboard.length >= 2 && (
            <section className="flex flex-col gap-2">
              <h2 className="eyebrow">Head to head</h2>
              <H2HMatrix
                players={leaderboard.map((s) => ({
                  id: s.player_id,
                  name: s.name,
                  emoji: s.emoji,
                }))}
                rows={h2h}
              />
              <p className="text-xs text-ink-muted">
                Read across the row: wins–losses against the player in that
                column.
              </p>
            </section>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/stats" className={buttonClass("secondary")}>
          ← This season
        </Link>
      </div>
    </main>
  );
}
