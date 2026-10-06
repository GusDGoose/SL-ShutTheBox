import Link from "next/link";
import { Delta } from "@/components/stats/primitives";
import type { PlayerCard as Card } from "@/lib/player-cards";

/** "1st", "2nd", "3rd", "4th" — a place, as people say it. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="eyebrow">{label}</dt>
      <dd className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * One player on the Players overview: who they are, what plays when they win,
 * what they have earned and how they are doing.
 *
 * The whole card opens the profile. The name is the only link, stretched over
 * the card with an ::after, so a screen reader meets one link per player
 * rather than a card full of them. Nothing here is editable — that lives on
 * your own profile.
 */
export function PlayerCard({
  card,
  song,
  isMe,
}: {
  card: Card;
  /** From songLabel(): the title, "Own clip", "Song set", or null. */
  song: string | null;
  isMe: boolean;
}) {
  const { player } = card;
  const played = card.games > 0;

  return (
    <li className="relative flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors focus-within:border-brass hover:border-brass/60">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="felt flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-brass text-2xl"
        >
          {player.emoji}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="flex min-w-0 items-baseline gap-2 font-[family-name:var(--font-display)] text-xl font-bold">
            <Link
              href={`/players/${player.id}`}
              className="truncate outline-none after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-['']"
            >
              {player.name}
            </Link>
            {isMe && (
              <span className="shrink-0 rounded-full bg-brass px-2 py-0.5 text-xs font-semibold text-ink">
                You
              </span>
            )}
          </h3>
          {song && (
            <p className="truncate text-sm text-ink-muted">
              <span aria-hidden>🎵 </span>
              <span className="sr-only">Song: </span>
              {song}
            </p>
          )}
        </div>
        {card.rating !== null && (
          <div className="flex shrink-0 flex-col items-end text-right">
            <span className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums">
              <span className="sr-only">Rated </span>
              {card.rating}
            </span>
            <span className="text-xs text-ink-muted tabular-nums">
              {card.rank !== null && <>#{card.rank} </>}
              {card.weekDelta !== null && <Delta value={card.weekDelta} digits={0} />}
            </span>
          </div>
        )}
      </div>

      {card.badges.length > 0 && (
        <ul aria-label={`Badges, ${card.badgeCount} earned`} className="flex flex-wrap items-center gap-1.5">
          {card.badges.map((b) => (
            <li
              key={b.key}
              title={b.name}
              className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-base"
            >
              <span aria-hidden>{b.emoji}</span>
              <span className="sr-only">{b.name}</span>
            </li>
          ))}
          {card.moreBadges > 0 && (
            <li className="px-1 text-xs font-semibold text-ink-muted tabular-nums">
              <span aria-hidden>+{card.moreBadges}</span>
              <span className="sr-only">and {card.moreBadges} more</span>
            </li>
          )}
        </ul>
      )}

      {played ? (
        <>
          <dl className="grid grid-cols-4 gap-2">
            <Stat
              label="Lowest"
              value={card.lowest === null ? "—" : card.lowest === 0 ? "📦 0" : String(card.lowest)}
            />
            <Stat label="Avg" value={card.avg === null ? "—" : String(card.avg)} />
            <Stat label="Wins" value={String(card.wins)} />
            <Stat label="Games" value={String(card.games)} />
          </dl>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
            {card.form.length > 0 && (
              <ol
                aria-label={`Last ${card.form.length} games, oldest first`}
                className="flex items-center gap-1"
              >
                {card.form.map((f, i) => (
                  <li
                    key={i}
                    title={`${ordinal(f.position)} of ${f.of}`}
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
                      f.won ? "bg-brass text-ink" : "bg-surface-2 text-ink"
                    }`}
                  >
                    <span aria-hidden>{f.won ? "👑" : f.position}</span>
                    <span className="sr-only">
                      {f.won ? "won" : `${ordinal(f.position)} of ${f.of}`}
                      {f.shut ? ", shut the box" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {card.winPct !== null && <span className="tabular-nums">{card.winPct}% won</span>}
            {card.streak > 0 && (
              <span className="tabular-nums">
                <span aria-hidden>🔥</span> {card.streak}
                <span className="sr-only"> days in a row</span>
              </span>
            )}
            {card.shutBoxes > 0 && (
              <span className="tabular-nums">
                <span aria-hidden>📦</span> {card.shutBoxes}
                <span className="sr-only"> shut boxes</span>
              </span>
            )}
            {card.fika > 0 && (
              <span className="tabular-nums">
                <span aria-hidden>☕</span> {card.fika}
                <span className="sr-only"> fika weeks</span>
              </span>
            )}
            {card.titles > 0 && (
              <span className="tabular-nums">
                <span aria-hidden>🏆</span> {card.titles}
                <span className="sr-only"> {card.titles === 1 ? "title" : "titles"}</span>
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted">No games yet — the box is waiting.</p>
      )}
    </li>
  );
}
