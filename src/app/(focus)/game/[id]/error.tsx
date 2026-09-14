"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";

// Next 16 passes `retry`, not `reset`; under the old name the button did nothing.
export default function GameError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
      <span aria-hidden className="text-5xl">
        🎲
      </span>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        The box jammed.
      </h1>
      <p role="alert" className="text-sm text-ink-muted">
        Something went wrong loading this game. Nothing was lost — the score
        lives in the database, not in this page.
      </p>
      <div className="flex gap-2">
        <Button onClick={retry}>Try again</Button>
        <Link href="/" className={buttonClass("secondary")}>
          Back to Today
        </Link>
      </div>
      {error.digest && (
        <p className="text-xs text-ink-muted">Reference: {error.digest}</p>
      )}
    </main>
  );
}
