import Link from "next/link";
import { Settings } from "lucide-react";
import { NavTabs } from "@/components/shell/nav-tabs";
import { SoundToggle } from "@/components/shell/sound-toggle";

// The everyday chrome: brand, the four tabs, and a gear. Focus routes (the
// board, the PIN gate) sit outside this group so nothing competes with them.
export default function ShellLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="wood flex items-center justify-between gap-4 border-b border-black/25 px-4 py-3 text-ivory md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold"
        >
          <span aria-hidden className="text-xl">
            🎲
          </span>
          Shut the Box
        </Link>
        <div className="flex items-center gap-2">
          <NavTabs />
          <SoundToggle className="text-ivory/70 hover:text-ivory" />
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex size-11 items-center justify-center rounded-full text-ivory/70 transition-colors hover:bg-black/15 hover:text-ivory"
          >
            <Settings aria-hidden size={20} />
          </Link>
        </div>
      </header>
      {/* Bottom padding clears the fixed tab rail on a phone. */}
      <div className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
    </>
  );
}
