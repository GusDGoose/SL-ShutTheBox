export type TabId = "today" | "play" | "stats" | "players" | "more";

export type Tab = {
  id: TabId;
  href: string;
  label: string;
  /** Extra path prefixes that should light this tab up. */
  also?: string[];
};

/**
 * The five rooms of the app: a bottom rail on a phone, a header rail on a
 * laptop.
 *
 * [concept: every route belongs to a tab] The first version had four tabs and
 * five pages. By the time there were fourteen pages, six of them — the rules,
 * settings, the scrapbook, recording a game — hung off in-page links with no
 * tab of their own, so on those routes NOTHING in the rail was lit and there
 * was no way to tell where you were or what else existed. "More" exists to
 * give the leftovers a home; anything added from here on gets a tab or a
 * listing on /more, never just a link from the one page that needed it.
 *
 * Game routes are deliberately absent: they render in the (focus) group,
 * which has no rail at all, so mapping them to a tab would be dead config.
 */
export const TABS: Tab[] = [
  { id: "today", href: "/", label: "Today" },
  // Recording a game played on the real box is still starting a game.
  { id: "play", href: "/play", label: "Play", also: ["/record"] },
  // The scrapbook is stats-shaped, and shares their period switcher.
  { id: "stats", href: "/stats", label: "Stats", also: ["/history"] },
  { id: "players", href: "/players", label: "Players" },
  {
    id: "more",
    href: "/more",
    label: "More",
    // /settings redirects to /more; the alias keeps an old bookmark lit.
    also: ["/rules", "/settings", "/fika"],
  },
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
