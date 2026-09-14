import { SoundToggle } from "@/components/shell/sound-toggle";

/**
 * The chrome for team play.
 *
 * A third group beside (shell) and (focus), because neither fits. (shell) has
 * the tab rail, which leads everywhere a guest cannot go; (focus) has a "Today"
 * link, which for somebody with no PIN is a one-way trip to the gate. What is
 * left is a title and a mute button — the pages carry their own way back to the
 * lobby, because that is the only place a guest belongs.
 *
 * Everything under this group is reachable without the team PIN. If a route
 * here ever needs a colleague rather than a guest, it says so itself, the way
 * /t/new does.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="wood-chrome flex items-center justify-between gap-4 border-b border-black/25 px-4 py-3 text-ivory md:px-6">
        <p className="flex min-w-0 items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold">
          <span aria-hidden className="text-xl">
            🎲
          </span>
          <span className="truncate">Shut the Box</span>
          <span className="truncate text-ivory/70">· Team play</span>
        </p>
        <SoundToggle className="shrink-0 text-ivory/70 hover:text-ivory" />
      </header>
      <div className="flex-1">{children}</div>
    </>
  );
}
