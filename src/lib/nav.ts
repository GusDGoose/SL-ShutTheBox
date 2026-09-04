export type TabId = "today" | "play" | "stats" | "players";

export type Tab = {
  id: TabId;
  href: string;
  label: string;
  /** Extra path prefixes that should light this tab up. */
  also?: string[];
};

// Bottom rail on a phone, header rail on a laptop — same four destinations.
export const TABS: Tab[] = [
  { id: "today", href: "/", label: "Today" },
  // A game in progress belongs to Play, not Today.
  { id: "play", href: "/play", label: "Play", also: ["/game"] },
  // History is stats-shaped, and lives behind a link on the stats page.
  { id: "stats", href: "/stats", label: "Stats", also: ["/history"] },
  { id: "players", href: "/players", label: "Players" },
];

/**
 * Whether `tab` should be marked current for `pathname`.
 * "/" has to match exactly or it would be active everywhere; every other route
 * matches itself and its children ("/players/abc" keeps Players lit).
 */
export function isTabActive(pathname: string, tab: Tab): boolean {
  const candidates = [tab.href, ...(tab.also ?? [])];
  return candidates.some((base) =>
    base === "/"
      ? pathname === "/"
      : pathname === base || pathname.startsWith(`${base}/`),
  );
}

/** The single active tab for a path, or undefined on routes outside the tabs. */
export function activeTab(pathname: string): Tab | undefined {
  return TABS.find((tab) => isTabActive(pathname, tab));
}
