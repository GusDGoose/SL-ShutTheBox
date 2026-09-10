import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeGrid } from "@/components/stats/badge-grid";
import { Heatstrip } from "@/components/stats/heatstrip";
import { RatingChart } from "@/components/stats/rating-chart";
import { PhotoStrip } from "@/components/history/photo-strip";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getIdentity } from "@/lib/auth";
import { dayLabel, stockholmToday } from "@/lib/dates";
import { getPlayerProfile } from "@/lib/queries/history";
import { getFikaTally } from "@/lib/queries/fika";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const profile = UUID.test(id) ? await getPlayerProfile(id) : null;
  return {
    title: profile ? `${profile.player.name} · Shut the Box` : "Player · Shut the Box",
  };
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
      <span className="eyebrow">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}

/** One player: who they are at the table, in numbers and pictures. */
export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [profile, me, fikaTally] = await Promise.all([
    getPlayerProfile(id),
    getIdentity(),
    getFikaTally(),
  ]);
  if (!profile) notFound();

  const { player, stats, streak, rating, ratingRank } = profile;
  const isMe = me?.id === player.id;
  const played = (stats?.games_played ?? 0) > 0;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
      {/* ---------------- Hero ---------------- */}
      <header className="flex items-center gap-4">
        <span
          aria-hidden
          className="felt flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-brass text-4xl shadow-[var(--shadow-card)]"
        >
          {player.emoji}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-baseline gap-2 font-[family-name:var(--font-display)] text-3xl font-bold">
            <span className="truncate">{player.name}</span>
            {isMe && (
              <span className="rounded-full bg-brass px-2 py-0.5 text-xs font-semibold text-ink">
                You
              </span>
            )}
            {!player.is_active && (
              <span className="text-sm font-normal text-ink-muted">benched</span>
            )}
          </h1>
          {rating ? (
            <p className="text-sm text-ink-muted">
              Rated{" "}
              <span className="font-[family-name:var(--font-display)] text-lg font-bold text-ink tabular-nums">
                {Math.round(rating.rating)}
              </span>
              {ratingRank && <> · #{ratingRank} at the table</>}
              {!rating.is_established && <> · still settling</>}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Not rated yet.</p>
          )}
        </div>
      </header>

      {!played ? (
        <EmptyState
          art="🎲"
          title="No games yet — the box is waiting."
          body={`${player.name} has not finished a game. The stats fill in from the first one.`}
          cta={
            <Link href="/play" className={buttonClass("primary")}>
              Start a game
            </Link>
          }
        />
      ) : (
        <>
          {/* ---------------- Tiles ---------------- */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Games" value={String(stats!.games_played)} />
            <Tile
              label="Wins"
              value={String(stats!.wins)}
              hint={stats!.win_pct === null ? undefined : `${stats!.win_pct}% of games`}
            />
            <Tile label="Average" value={stats!.avg_score === null ? "—" : String(stats!.avg_score)} />
            <Tile
              label="Best"
              value={stats!.best_score === null ? "—" : String(stats!.best_score)}
              hint={stats!.shut_boxes > 0 ? `📦 ${stats!.shut_boxes} shut` : undefined}
            />
            <Tile
              label="Streak"
              value={`🔥 ${streak?.current_streak ?? 0}`}
              hint={`best ${streak?.best_streak ?? 0}`}
            />
            <Tile
              label="Avg place"
              value={stats!.avg_finish === null ? "—" : String(stats!.avg_finish)}
            />
            {(fikaTally.get(id) ?? 0) > 0 && (
              <Tile
                label="Fika"
                value={`☕ ${fikaTally.get(id)}`}
                hint="weeks they bought"
              />
            )}
            {stats!.dnp_count > 0 && (
              <Tile
                label="Boxed out"
                value={String(stats!.dnp_count)}
                hint="turns lost to a shut box"
              />
            )}
            {rating && (
              <Tile
                label="Peak"
                value={String(Math.round(rating.peak_rating))}
                hint={rating.below_peak > 0 ? `${Math.round(rating.below_peak)} below` : "at it now"}
              />
            )}
          </section>

          {/* ---------------- Rating & form ---------------- */}
          <RatingChart
            label={player.name}
            points={profile.ratingHistory.map((h) => ({
              date: h.played_on,
              rating: Number(h.rating_after),
            }))}
          />
          <Heatstrip label={player.name} days={profile.form} today={stockholmToday()} />

          {/* ---------------- Rivalries ---------------- */}
          {(profile.nemesis || profile.victim) && (
            <section className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-sm">
              <h2 className="eyebrow">Rivalries</h2>
              {profile.nemesis && (
                <p>
                  Loses most to <span aria-hidden>{profile.nemesis.emoji}</span>{" "}
                  <span className="font-semibold">{profile.nemesis.name}</span>{" "}
                  <span className="text-ink-muted tabular-nums">
                    ({profile.nemesis.a_wins}–{profile.nemesis.b_wins} in {profile.nemesis.meetings})
                  </span>
                </p>
              )}
              {profile.victim && (
                <p>
                  Favourite victim: <span aria-hidden>{profile.victim.emoji}</span>{" "}
                  <span className="font-semibold">{profile.victim.name}</span>{" "}
                  <span className="text-ink-muted tabular-nums">
                    ({profile.victim.a_wins}–{profile.victim.b_wins} in {profile.victim.meetings})
                  </span>
                </p>
              )}
            </section>
          )}

          {/* ---------------- Badges ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">
              Badges · {profile.earned.length} of {profile.catalog.length}
            </h2>
            <BadgeGrid catalog={profile.catalog} earned={profile.earned} />
          </section>

          {/* ---------------- Scrapbook ---------------- */}
          <PhotoStrip
            photos={profile.recent
              .filter((g) => g.photo_path)
              .map((g) => ({ gameId: g.game_id, playedOn: g.played_on }))}
          />

          {/* ---------------- Recent games ---------------- */}
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Recent games</h2>
            <ul className="flex flex-col gap-1">
              {profile.recent.map((g) => (
                <li key={g.game_id}>
                  <Link
                    href={`/game/${g.game_id}`}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-4 py-2.5 text-sm transition-colors hover:border-brass/60"
                  >
                    <span>{dayLabel(g.played_on)}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="text-ink-muted">
                        {g.finish_position === 1 ? "won" : `${g.finish_position}. of ${g.participants}`}
                      </span>
                      <span className="font-[family-name:var(--font-display)] text-lg font-bold">
                        {g.is_shut_box ? "📦 0" : g.score}
                        {g.is_winner && " 👑"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/players" className={buttonClass("secondary")}>
          ← Players
        </Link>
        <Link href="/stats" className={buttonClass("ghost")}>
          Stats
        </Link>
      </div>
    </main>
  );
}
