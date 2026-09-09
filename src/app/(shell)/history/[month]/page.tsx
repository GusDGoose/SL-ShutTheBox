import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GameCard } from "@/components/history/game-card";
import { PhotoStrip } from "@/components/history/photo-strip";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { dayLabel, stockholmToday } from "@/lib/dates";
import { isMonth, monthLabel, monthOf, shiftMonth } from "@/lib/months";
import { getHistoryMonth, getHistoryMonths } from "@/lib/queries/history";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/history/[month]">) {
  const { month } = await params;
  return {
    title: isMonth(month)
      ? `${monthLabel(month)} · Shut the Box`
      : "History · Shut the Box",
  };
}

/**
 * A month of games, day by day, newest first.
 *
 * v1 listed the two hundred most recent result rows under the stats page and
 * called it history. This is the actual history: bounded by month so it never
 * silently truncates, with the photos of the month as a scrapbook on top.
 */
export default async function HistoryMonthPage({
  params,
}: PageProps<"/history/[month]">) {
  const { month } = await params;
  if (!isMonth(month)) notFound();

  const [data, months] = await Promise.all([
    getHistoryMonth(month),
    getHistoryMonths(),
  ]);
  const thisMonth = monthOf(stockholmToday());

  // The month's headline: who won the most days, and how many boxes were shut.
  const leader = [...data.dayWins].sort((a, b) => b[1] - a[1])[0];
  const leaderPlayer = leader ? data.players.get(leader[0]) : undefined;

  // Group by day, keeping the newest-first order the query returned.
  const days: { date: string; games: typeof data.games }[] = [];
  for (const g of data.games) {
    const last = days[days.length - 1];
    if (last && last.date === g.played_on) last.games.push(g);
    else days.push({ date: g.played_on, games: [g] });
  }

  const photos = data.games
    .filter((g) => g.photo_path)
    .map((g) => ({ gameId: g.id, playedOn: g.played_on }));

  const navLink =
    "inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <nav
        aria-label="Month"
        className="flex items-center justify-between gap-2"
      >
        <Link href={`/history/${shiftMonth(month, -1)}`} className={navLink}>
          <ChevronLeft aria-hidden size={18} />
          <span className="sr-only">Earlier: </span>
          {monthLabel(shiftMonth(month, -1))}
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
          {monthLabel(month)}
        </h1>
        {month < thisMonth ? (
          <Link href={`/history/${shiftMonth(month, 1)}`} className={navLink}>
            {monthLabel(shiftMonth(month, 1))}
            <span className="sr-only"> (later)</span>
            <ChevronRight aria-hidden size={18} />
          </Link>
        ) : (
          // Keeps the heading centred when there is no later month to go to.
          <span aria-hidden className="min-w-11" />
        )}
      </nav>

      {data.games.length === 0 ? (
        <EmptyState
          art="📦"
          title={`Nothing in the box for ${monthLabel(month).split(" ")[0]}.`}
          body={
            month <= thisMonth
              ? "If a game was played without the app, it can still be recorded."
              : "That month has not happened yet."
          }
          cta={
            month <= thisMonth ? (
              <Link href="/record" className={buttonClass("secondary")}>
                Record a game
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink tabular-nums">
              {data.games.length}
            </span>{" "}
            {data.games.length === 1 ? "game" : "games"}
            {leaderPlayer && leader && (
              <>
                {" · "}
                <span aria-hidden>{leaderPlayer.emoji}</span>{" "}
                <span className="font-semibold text-ink">{leaderPlayer.name}</span>{" "}
                won {leader[1]} {leader[1] === 1 ? "day" : "days"}
              </>
            )}
            {data.shutBoxes > 0 && (
              <>
                {" · "}
                <span aria-hidden>📦</span> {data.shutBoxes}{" "}
                {data.shutBoxes === 1 ? "shut box" : "shut boxes"}
              </>
            )}
          </p>

          <PhotoStrip photos={photos} />

          {days.map((day) => (
            <section key={day.date} className="flex flex-col gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">
                {dayLabel(day.date)}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {day.games.map((g, i) => (
                  <GameCard
                    key={g.id}
                    game={g}
                    players={data.players}
                    label={day.games.length > 1 ? `Game ${day.games.length - i}` : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {months.length > 0 && (
        <nav aria-label="Months with games" className="flex flex-wrap gap-2 pt-2">
          {months.map((m) => (
            <Link
              key={m}
              href={`/history/${m}`}
              aria-current={m === month ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${
                m === month
                  ? "bg-brass text-ink"
                  : "border border-line text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {monthLabel(m)}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/record" className={buttonClass("ghost")}>
          Played without the app? Record a game
        </Link>
        <Link href="/stats" className={buttonClass("ghost")}>
          Stats
        </Link>
      </div>
    </main>
  );
}
