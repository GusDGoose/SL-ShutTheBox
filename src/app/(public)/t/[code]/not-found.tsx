import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function TournamentNotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
      <span aria-hidden className="text-5xl">
        🎲
      </span>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        No team play has that code.
      </h1>
      <p className="text-sm text-ink-muted">
        Check the six characters on the screen — it is easy to read one wrong.
        The code may also belong to an event that has been cleared away.
      </p>
      <Link href="/" className={buttonClass("secondary")}>
        Shut the Box
      </Link>
    </main>
  );
}
