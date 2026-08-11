import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shut the Box",
  description: "Daily office Shut the Box — scores, streaks and victory songs",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="text-xl">🎲</span> Shut the Box
          </Link>
          <nav className="flex gap-4 text-sm font-medium">
            <Link href="/" className="opacity-80 hover:opacity-100">
              Play
            </Link>
            <Link href="/stats" className="opacity-80 hover:opacity-100">
              Stats
            </Link>
            <Link href="/players" className="opacity-80 hover:opacity-100">
              Players
            </Link>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
