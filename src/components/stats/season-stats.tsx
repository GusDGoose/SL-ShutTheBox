import Link from "next/link";
import { SeasonBanner } from "@/components/shell/season-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { Distribution } from "./distribution";
import { H2HMatrix } from "./h2h-matrix";
import { BarRow, Delta, Sparkline } from "./primitives";
import { SeasonNav } from "./season-nav";
import { Cell, StatsRow, StatsTable } from "./stats-table";
import {
  getHeadToHead,
  getRatings,
  getRecentRatingHistory,
  getSeasonDistribution,
  getSeasons,
  getStandings,
  getTrends,
  ratingMovement,
  type SeasonWithRules,
} from "@/lib/queries/stats";

/**
 * One season's numbers.
 *
 * Shared by /stats (the season being played) and /stats/season/[id] (an older
 * one), because they are the same page pointed at a different season — and the
 * moment they were two files they would start to drift.
 */
export async function SeasonStats({
  season,
  currentId,
}: {
  season: SeasonWithRules;
  currentId: string;
}) {
  const [seasons, standings, ratings, history, distribution, trends, h2h] =
    await Promise.all([
      getSeasons(),
      getStandings(season.id),
      getRatings(),
      getRecentRatingHistory(),
      getSeasonDistribution(season.id),
      getTrends(),
      getHeadToHead(),
    ]);

  const { series, weekDelta } = ratingMovement(history);
  const maxDayWins = Math.max(...standings.map((s) => s.day_wins), 1);
  // A season can run a highest-wins ruleset, so which way a good score points
  // is a property of the season rather than something to hard-code.
  const lowerIsBetter = season.rules.win === "lowest";

  // Only the people who actually played this season, so a season that started
  // yesterday does not show the whole roster on zero.
  const played = new Set(standings.map((s) => s.player_id));
  const seasonMonths = trends.filter(
    (t) => t.month >= season.starts_on && t.month <= season.ends_on,
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Stats
        </h1>
        <SeasonNav seasons={seasons} currentId={currentId} active={season.id} />
      </div>

      <SeasonBanner season={season} />

      {standings.length === 0 ? (
        <EmptyState
          art="📦"
          title="Nobody yet — the box awaits."
          body="This season has no finished games in it. Play one and the table fills itself in."
          cta={
            <Link href="/play" className={buttonClass("primary", "lg")}>
              Start a game 🎲
            </Link>
          }
        />
      ) : (
        <>
          {/* ---------------- Standings ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Standings</h2>
            <StatsTable
              caption={`Season ${season.number} standings`}
              headers={[
                "Player",
                "Day wins",
                "Games",
                "Avg",
                "Best",
                "Avg place",
                "📦",
              ]}
            >
              {standings.map((s) => (
                <StatsRow key={s.player_id} highlight={s.rnk === 1}>
                  <Cell header>
                    <Link href={`/players/${s.player_id}`} className="hover:underline">
                      <span aria-hidden>{s.emoji}</span> {s.name}
                    </Link>
                    {s.rnk === 1 && (
                      <>
                        {" "}
                        <span aria-hidden>👑</span>
                        <span className="sr-only">leading</span>
                      </>
                    )}
                  </Cell>
                  <Cell>
                    <BarRow value={s.day_wins} max={maxDayWins} />
                  </Cell>
                  <Cell num>{s.games_played}</Cell>
                  <Cell num>{s.avg_score ?? "—"}</Cell>
                  <Cell num>{s.best_score ?? "—"}</Cell>
                  <Cell num>{s.avg_finish ?? "—"}</Cell>
                  <Cell num>{s.shut_boxes}</Cell>
                </StatsRow>
              ))}
            </StatsTable>
            <p className="text-xs text-ink-muted">
              A day win is a day you won, not a game — winning either game on a
              two-game day counts once.
            </p>
          </section>

          {/* ---------------- Ratings ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Ratings</h2>
            <StatsTable
              caption="Skill ratings, all-time"
              headers={["Player", "Rating", "Last 90 days", "This week", "Games"]}
            >
              {ratings
                .filter((r) => r.rated_games > 0)
                .map((r) => (
                  <StatsRow key={r.player_id}>
                    <Cell header>
                      <span aria-hidden>{r.emoji}</span> {r.name}
                      {!r.is_established && (
                        <span className="ml-1 text-xs text-ink-muted">
                          provisional
                        </span>
                      )}
                    </Cell>
                    <Cell num>
                      <span className="font-[family-name:var(--font-display)] text-base font-bold">
                        {Math.round(r.rating)}
                      </span>
                    </Cell>
                    <Cell>
                      <Sparkline
                        values={series.get(r.player_id) ?? []}
                        label={`${r.name}'s rating`}
                      />
                    </Cell>
                    <Cell num>
                      <Delta value={weekDelta.get(r.player_id) ?? null} />
                    </Cell>
                    <Cell num>{r.rated_games}</Cell>
                  </StatsRow>
                ))}
            </StatsTable>
            <p className="text-xs text-ink-muted">
              Ratings are all-time and span seasons — they start at 1000 and
              move by how surprising each result was. Under ten games they are
              still settling.
            </p>
          </section>

          {/* ---------------- Distribution ---------------- */}
          <Distribution scores={distribution} />

          {/* ---------------- Form ---------------- */}
          {seasonMonths.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="eyebrow">Form, month by month</h2>
              <StatsTable
                caption="Average score per month this season"
                headers={["Player", "Trend", "Months", "Best month"]}
              >
                {standings.map((s) => {
                  const mine = seasonMonths
                    .filter((t) => t.player_id === s.player_id)
                    .map((t) => Number(t.avg_score ?? 0));
                  // "Best" follows the ruleset's win direction, not a guess
                  // that a small number is always a good one.
                  const pickBest = lowerIsBetter ? Math.min : Math.max;
                  const best = seasonMonths
                    .filter((t) => t.player_id === s.player_id)
                    .reduce<number | null>(
                      (acc, t) =>
                        t.avg_score === null
                          ? acc
                          : acc === null
                            ? Number(t.avg_score)
                            : pickBest(acc, Number(t.avg_score)),
                      null,
                    );
                  return (
                    <StatsRow key={s.player_id}>
                      <Cell header>
                        <span aria-hidden>{s.emoji}</span> {s.name}
                      </Cell>
                      <Cell>
                        <Sparkline
                          values={mine}
                          label={`${s.name}'s monthly average`}
                          unit="months"
                          goodDirection={lowerIsBetter ? "down" : "up"}
                        />
                      </Cell>
                      <Cell num>{mine.length}</Cell>
                      <Cell num>{best === null ? "—" : best.toFixed(2)}</Cell>
                    </StatsRow>
                  );
                })}
              </StatsTable>
              <p className="text-xs text-ink-muted">
                {lowerIsBetter
                  ? "Lower is better this season, so a line that falls is a player improving."
                  : "Higher is better this season, so a line that climbs is a player improving."}
              </p>
            </section>
          )}

          {/* ---------------- Head to head ---------------- */}
          {played.size >= 2 && (
            <section className="flex flex-col gap-2">
              <h2 className="eyebrow">Head to head</h2>
              <H2HMatrix
                players={standings.map((s) => ({
                  id: s.player_id,
                  name: s.name,
                  emoji: s.emoji,
                }))}
                rows={h2h}
              />
              <p className="text-xs text-ink-muted">
                Read across the row: wins–losses against the player in that
                column, over every season.
              </p>
            </section>
          )}
        </>
      )}

      {/* All-time and History are pills in the switcher at the top of this
          page now, so repeating them down here is just noise. */}
      <div className="flex flex-wrap gap-3">
        <Link href="/rules" className={buttonClass("ghost")}>
          House rules
        </Link>
      </div>
    </main>
  );
}
