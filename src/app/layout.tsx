import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fraunces, Geist } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { ThemeSync } from "@/components/shell/theme-sync";
import { InlineScript } from "@/components/shell/inline-script";
import {
  MODE_COOKIE,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
  THEME_META,
  parseMode,
  parseTheme,
  themeColorFor,
} from "@/lib/theme";
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

export const metadata: Metadata = {
  title: "Shut the Box",
  description: "Daily office Shut the Box — scores, streaks and victory songs",
};

export async function generateViewport(): Promise<Viewport> {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
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
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);

  return (
    <html
      lang="en"
      // The inline script below rewrites data-mode before React hydrates.
      suppressHydrationWarning
      data-theme={theme}
      data-mode={mode}
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* Resolves "system" (and pins neon to night) before the first paint,
            so a dark-mode phone never flashes the daylight palette. */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <ThemeSync theme={theme} mode={mode} />
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
