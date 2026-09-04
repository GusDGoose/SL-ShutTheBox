import Link from "next/link";
import { getIdentity } from "@/lib/auth";

/**
 * Who this device is signed in as. Rendered on the server and wrapped in a
 * Suspense boundary by the shell, so a navigation never waits on the roster
 * query just to draw the header.
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
      href="/whoami"
      className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-ivory/80 transition-colors hover:text-ivory"
      title={`You are ${player.name} on this device`}
    >
      <span aria-hidden className="text-lg">
        {player.emoji}
      </span>
      <span className="font-semibold">{player.name}</span>
      <span className="hidden text-ivory/60 sm:inline">· switch</span>
    </Link>
  );
}

export function IdentityChipFallback() {
  return <span className="flex min-h-11 w-24 items-center" aria-hidden />;
}
