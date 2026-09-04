import type { ReactNode } from "react";

// The empty states carry a lot of this app's personality
// ("Nobody yet — the box awaits"), so they get a real component.
export function EmptyState({
  art = "📦",
  title,
  body,
  cta,
}: {
  art?: ReactNode;
  title: string;
  body?: string;
  cta?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-6 py-12 text-center">
      <div className="text-6xl" aria-hidden>
        {art}
      </div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
        {title}
      </h2>
      {body && <p className="max-w-sm text-ink-muted">{body}</p>}
      {cta}
    </div>
  );
}
