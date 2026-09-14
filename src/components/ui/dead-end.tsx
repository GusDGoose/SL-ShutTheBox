import type { ReactNode } from "react";

/**
 * A whole page that is one message: the thing you came for is not here, and
 * this is where to go instead. Team play needs it three times over (a deleted
 * event, a vanished team, a code nobody handed out), so it stopped being
 * hand-laid-out each time.
 */
export function DeadEnd({
  art,
  title,
  body,
  cta,
}: {
  art: string;
  title: string;
  body?: string;
  cta: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
      <span aria-hidden className="text-5xl">
        {art}
      </span>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        {title}
      </h1>
      {body && <p className="text-sm text-ink-muted">{body}</p>}
      {cta}
    </main>
  );
}
