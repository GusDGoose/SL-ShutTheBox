import { cookies } from "next/headers";
import Link from "next/link";
import { AppearanceControls } from "@/components/shell/theme-picker";
import { buttonClass } from "@/components/ui/button";
import { getIdentity } from "@/lib/auth";
import { MODE_COOKIE, THEME_COOKIE, parseMode, parseTheme } from "@/lib/theme";

export const metadata = { title: "Settings · Shut the Box" };

// Appearance and identity. The Teams indicator and install hint land with the
// packages that introduce them.
export default async function SettingsPage() {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  const player = await getIdentity();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Settings
        </h1>
        <p className="text-sm text-ink-muted">
          Saved on this device only — everyone can have their own board.
        </p>
      </div>
      <AppearanceControls initialTheme={theme} initialMode={mode} />

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">You</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          {player ? (
            <>
              <span aria-hidden className="text-3xl">
                {player.emoji}
              </span>
              <div className="flex-1">
                <p className="font-semibold">{player.name}</p>
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
              <p className="flex-1 text-sm text-ink-muted">
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
