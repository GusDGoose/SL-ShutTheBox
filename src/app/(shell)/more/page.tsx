import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, ChevronRight, Coffee, Images, PencilLine } from "lucide-react";
import { AppearanceControls } from "@/components/shell/theme-picker";
import { SoundSetting } from "@/components/shell/sound-setting";
import { InstallHint } from "@/components/shell/install-hint";
import { buttonClass } from "@/components/ui/button";
import { getIdentity } from "@/lib/auth";
import { stockholmToday } from "@/lib/dates";
import { MODE_COOKIE, THEME_COOKIE, parseMode, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export const metadata = { title: "More · Shut the Box" };

/**
 * Everything that is not one of the four everyday tabs.
 *
 * [concept: one place for the leftovers] The rules, the scrapbook, recording
 * a game and the settings each used to be reachable only from whichever page
 * happened to link to them, so there was no way to learn the app existed
 * beyond the tab you were standing on. They are all listed here, and this
 * page is itself a tab.
 */
export default async function MorePage() {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  const player = await getIdentity();
  const thisMonth = stockholmToday().slice(0, 7);

  const rooms = [
    {
      href: "/rules",
      icon: BookOpen,
      title: "House rules",
      body: "What this season's ruleset says, and how a score is worked out.",
    },
    {
      href: `/history/${thisMonth}`,
      icon: Images,
      title: "History & scrapbook",
      body: "Every game month by month, with the photos of the day.",
    },
    {
      href: "/fika",
      icon: Coffee,
      title: "Fika rota",
      body: "Who buys this week, why it is them, and everyone before.",
    },
    {
      href: "/record",
      icon: PencilLine,
      title: "Record a game",
      body: "Played on the real box, or on a day nobody opened the app.",
    },
  ];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          More
        </h1>
        <p className="text-sm text-ink-muted">
          The rest of the app, and how this device behaves.
        </p>
      </div>

      <nav aria-label="Other pages" className="flex flex-col gap-2">
        {rooms.map(({ href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:bg-surface-2"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brass/20 text-brass-ink">
              <Icon aria-hidden size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{title}</span>
              <span className="block text-xs text-ink-muted">{body}</span>
            </span>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-muted" />
          </Link>
        ))}
      </nav>

      <AppearanceControls initialTheme={theme} initialMode={mode} />

      <SoundSetting />

      <InstallHint />

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">You</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          {player ? (
            <>
              <span aria-hidden className="text-3xl">
                {player.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{player.name}</p>
                <p className="text-xs text-ink-muted">
                  Your name goes on games you save and edits you make.
                </p>
              </div>
              <Link href="/whoami" className={buttonClass("secondary")}>
                Switch player
              </Link>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-sm text-ink-muted">
                This device has not said who is holding it.
              </p>
              <Link href="/whoami" className={buttonClass("primary")}>
                Who are you?
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
