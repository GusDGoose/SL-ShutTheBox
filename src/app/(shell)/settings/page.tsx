import { cookies } from "next/headers";
import { AppearanceControls } from "@/components/shell/theme-picker";
import { MODE_COOKIE, THEME_COOKIE, parseMode, parseTheme } from "@/lib/theme";

export const metadata = { title: "Settings · Shut the Box" };

// Appearance only for now. Identity, sound and the Teams indicator land with
// the packages that introduce them.
export default async function SettingsPage() {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);

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
    </main>
  );
}
