import Link from "next/link";
import { Button, buttonClass } from "./button";

/**
 * Shared body for the error boundaries. The most likely cause by far is the
 * Supabase free tier pausing itself after a quiet week, so the copy names it
 * instead of showing a Postgres string.
 */
export function ErrorCard({
  digest,
  retry,
  showHomeLink = true,
}: {
  digest?: string;
  retry: () => void;
  showHomeLink?: boolean;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <div aria-hidden className="text-6xl">
        😴
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        The scoreboard is napping.
      </h1>
      <p className="text-ink-muted">
        Supabase pauses the database after a week of quiet. Give it a poke in the
        dashboard, or just try again.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>Wake it up</Button>
        {showHomeLink && (
          <Link href="/" className={buttonClass("secondary")}>
            Back to Today
          </Link>
        )}
      </div>
      {digest && <p className="text-xs text-ink-muted">Reference: {digest}</p>}
    </div>
  );
}
