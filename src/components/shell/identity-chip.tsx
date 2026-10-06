import Link from "next/link";
import { getIdentity } from "@/lib/auth";

/**
 * Who this device is signed in as — and the way to your own profile, where
 * your song and badges are. Switching player is on that profile and in More.
 *
 * Rendered on the server and wrapped in a Suspense boundary by the shell, so a
 * navigation never waits on the roster query just to draw the header.
 */
export async function IdentityChip() {
  const player = await getIdentity();

  if (!player) {
    return (
      <Link
        href="/whoami"
        className="flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-ivory/80 hover:text-ivory"
      >
        Who are you? →
      </Link>
    );
  }

  return (
    <Link
      href={`/players/${player.id}`}
      className="flex min-h-11 min-w-0 items-center gap-2 rounded-full px-3 text-sm text-ivory/80 transition-colors hover:text-ivory"
      title={`You are ${player.name} on this device — your profile`}
    >
      <span aria-hidden className="shrink-0 text-lg">
        {player.emoji}
      </span>
      {/* Truncated, not wrapped: the header is one line, and a name long
          enough to wrap is long enough to have pushed the page sideways. */}
      <span className="truncate font-semibold">{player.name}</span>
    </Link>
  );
}

export function IdentityChipFallback() {
  return <span className="flex min-h-11 w-24 items-center" aria-hidden />;
}
