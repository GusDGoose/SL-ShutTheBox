import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fraunces, Fredoka, Geist, Lilita_One, Silkscreen, VT323 } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { AudioProvider } from "@/components/ui/audio-provider";
import { ThemeSync } from "@/components/shell/theme-sync";
import { SeasonAmbient } from "@/components/shell/season-ambient";
import { InlineScript } from "@/components/shell/inline-script";
import {
  MODE_COOKIE,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
  THEME_META,
  parseMode,
  parseTheme,
  resolveTheme,
  themeColorFor,
} from "@/lib/theme";
import { SKIN_COOKIE, parseSkin, resolveSkin } from "@/lib/skins";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// A soft old-style serif for headlines, tile numerals and scoreboards — the
// wood-type/pub-sign end of the type spectrum, which is what makes a board of
// numbers feel like an object rather than a table.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

// The two skins' type (src/lib/skins.ts). Cartoon: a fat poster face over a
// round, friendly body. 90s: pixel capitals for headings and a terminal face
// for the numbers, over the Tahoma/Verdana of every 1998 homepage.
const lilita = Lilita_One({
  variable: "--font-lilita",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  display: "swap",
});
const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});
const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shut the Box",
  description: "Daily office Shut the Box — scores, streaks and victory songs",
};

export async function generateViewport(): Promise<Viewport> {
  const jar = await cookies();
  const theme = resolveTheme(parseTheme(jar.get(THEME_COOKIE)?.value));
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);

  // Browser chrome matches the board's darkest wood. On "system" we hand the
  // browser both colours and let it pick, since the server can't know.
  const themeColor =
    mode === "system" && !THEME_META[theme].forcesDark
      ? [
          {
            media: "(prefers-color-scheme: light)",
            color: themeColorFor(theme, "light"),
          },
          {
            media: "(prefers-color-scheme: dark)",
            color: themeColorFor(theme, "dark"),
          },
        ]
      : themeColorFor(theme, mode === "light" ? "light" : "dark");

  return {
    themeColor,
    // The board should reach the edges of a phone; the tab bar pads itself back
    // out with env(safe-area-inset-bottom).
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const pick = parseTheme(jar.get(THEME_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  const skinPick = parseSkin(jar.get(SKIN_COOKIE)?.value);

  return (
    <html
      lang="en"
      // The inline script below rewrites data-mode before React hydrates.
      suppressHydrationWarning
      // The board actually painted (today's season when the pick is
      // "seasonal"), and the pick itself, which ThemeSync re-resolves if the
      // tab is still open when the season turns.
      data-theme={resolveTheme(pick)}
      data-theme-pick={pick}
      data-mode={mode}
      data-mode-pick={mode}
      // This week's style, and the pick, re-resolved by ThemeSync on Monday.
      data-skin={resolveSkin(skinPick)}
      data-skin-pick={skinPick}
      className={`${geistSans.variable} ${fraunces.variable} ${lilita.variable} ${fredoka.variable} ${silkscreen.variable} ${vt323.variable} h-full antialiased`}
    >
      <head>
        {/* Resolves "system" (and pins the night-only boards) before the first paint,
            so a dark-mode phone never flashes the daylight palette. */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <ThemeSync theme={pick} mode={mode} />
        <SeasonAmbient />
        <AudioProvider>
          <Toaster>{children}</Toaster>
        </AudioProvider>
      </body>
    </html>
  );
}
