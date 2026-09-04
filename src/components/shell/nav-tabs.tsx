"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Dice5, Trophy, Users } from "lucide-react";
import { isTabActive, TABS, type TabId } from "@/lib/nav";

// Emoji carry meaning in this app (📦 shut, 👑 won, 🔥 streak); chrome uses
// monochrome icons instead, because they can take the brass accent and render
// identically on every OS.
const ICONS: Record<TabId, typeof Dice5> = {
  today: CalendarDays,
  play: Dice5,
  stats: Trophy,
  players: Users,
};

export function NavTabs() {
  const pathname = usePathname();

  return (
    // One <nav> for both breakpoints: a fixed rail at the bottom of a phone
    // (thumb reach), inline in the header on a laptop. CSS only, no duplicate
    // DOM for a screen reader to read twice.
    <nav
      aria-label="Main"
      className="wood fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-black/25 pb-[env(safe-area-inset-bottom)] md:static md:z-auto md:justify-end md:gap-1 md:border-0 md:bg-none md:pb-0 md:[background-image:none]"
    >
      {TABS.map((tab) => {
        const active = isTabActive(pathname, tab);
        const Icon = ICONS[tab.id];
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`group flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors md:min-h-11 md:flex-none md:flex-row md:gap-2 md:px-3 md:text-sm ${
              active
                ? "text-ivory"
                : "text-ivory/60 hover:text-ivory/90"
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-full px-3 py-1 transition-colors md:px-0 md:py-0 ${
                active ? "bg-brass/25 md:bg-transparent" : ""
              }`}
            >
              <Icon aria-hidden size={20} strokeWidth={active ? 2.5 : 2} />
            </span>
            <span
              className={
                active
                  ? "md:border-b-2 md:border-brass md:pb-0.5"
                  : "md:border-b-2 md:border-transparent md:pb-0.5"
              }
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
