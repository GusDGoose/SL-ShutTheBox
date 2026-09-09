import Link from "next/link";
import { dayLabel } from "@/lib/dates";

export type StripPhoto = { gameId: string; playedOn: string };

/**
 * The scrapbook: every photo of the day in the set, as prints in a row.
 *
 * Scrolls sideways inside its own box, so the page never does. Each print is
 * a link to its game — the photo is the way back to the day.
 */
export function PhotoStrip({
  photos,
  title = "Scrapbook",
}: {
  photos: StripPhoto[];
  title?: string;
}) {
  if (photos.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="eyebrow">{title}</h2>
      <ul className="flex gap-4 overflow-x-auto px-1 pb-3 pt-2">
        {photos.map((photo, i) => (
          <li key={photo.gameId} className="shrink-0">
            <Link
              href={`/game/${photo.gameId}`}
              // Alternate the tilt so a row reads as prints laid down by hand
              // rather than a grid that slipped.
              className={`block rounded-sm bg-ivory p-1.5 pb-4 shadow-[var(--shadow-card)] transition-transform hover:rotate-0 ${
                i % 2 === 0 ? "-rotate-1" : "rotate-1"
              }`}
            >
              {/* Plain <img>: the route answers with a short-lived signed URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photo/${photo.gameId}`}
                alt={`Photo from ${dayLabel(photo.playedOn)}`}
                loading="lazy"
                className="h-28 w-28 object-cover"
              />
              <span className="mt-1 block text-center text-[0.625rem] tabular-nums text-ink-muted">
                {photo.playedOn}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
