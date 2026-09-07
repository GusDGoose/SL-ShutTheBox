import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function GameNotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
      <span aria-hidden className="text-5xl">
        📦
      </span>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        That game isn&apos;t in the box.
      </h1>
      <p className="text-sm text-ink-muted">
        It may have been deleted, or the link may be wrong.
      </p>
      <div className="flex gap-2">
        <Link href="/" className={buttonClass("primary")}>
          Today
        </Link>
        <Link href="/stats" className={buttonClass("secondary")}>
          Stats
        </Link>
      </div>
    </main>
  );
}
