import { Suspense } from "react";
import Link from "next/link";
import { NavTabs } from "@/components/shell/nav-tabs";
import { SoundToggle } from "@/components/shell/sound-toggle";
import {
  IdentityChip,
  IdentityChipFallback,
} from "@/components/shell/identity-chip";

// The everyday chrome: brand, who you are, mute, and the five tabs. The gear
// that used to sit here led to one settings page while the rules, the
// scrapbook and the rest had no home at all; "More" is a tab now, so a second
// door to it would just be clutter. Focus routes (the board, the PIN gate)
// sit outside this group so nothing competes with them.
export default function ShellLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="wood flex items-center justify-between gap-4 border-b border-black/25 px-4 py-3 text-ivory md:px-6">
        {/* min-w-0 on both halves: a flex child defaults to min-width:auto and
            refuses to shrink below its text, so a long player name in the chip
            pushed the header past the viewport and set the whole page
            side-scrolling. */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold"
        >
          <span aria-hidden className="text-xl">
            🎲
          </span>
          <span className="truncate">Shut the Box</span>
        </Link>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {/* Suspended so drawing the header never waits on the roster query. */}
          <Suspense fallback={<IdentityChipFallback />}>
            <IdentityChip />
          </Suspense>
          <NavTabs />
          <SoundToggle className="shrink-0 text-ivory/70 hover:text-ivory" />
        </div>
      </header>
      {/* Bottom padding clears the fixed tab rail on a phone. */}
      <div className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
    </>
  );
}
