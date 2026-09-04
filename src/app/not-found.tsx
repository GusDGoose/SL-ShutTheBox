import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <div aria-hidden className="text-6xl">
        📦
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        That page isn&apos;t in the box.
      </h1>
      <p className="text-ink-muted">
        The link may be old, or the game may have been deleted.
      </p>
      <Link href="/" className={buttonClass("primary")}>
        Back to Today
      </Link>
    </main>
  );
}
