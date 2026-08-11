import Link from "next/link";

// Placeholder home — Phase 4 turns this into the "today's game" dashboard.
export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center gap-6 p-10 text-center">
      <div className="text-7xl">🎲</div>
      <h1 className="text-3xl font-bold">Shut the Box</h1>
      <p className="max-w-md opacity-70">
        The daily office showdown. Lowest score wins the day — shut the box and
        become legend.
      </p>
      <Link
        href="/game/new"
        className="rounded-2xl bg-foreground px-8 py-4 text-lg font-semibold text-background transition-transform active:scale-95"
      >
        Start today&apos;s game
      </Link>
    </main>
  );
}
