// Placeholders shaped like the content they stand in for, so a slow page keeps
// its layout instead of collapsing. v1 had no loading states at all.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-[var(--radius-control)] bg-surface-2 motion-safe:animate-pulse ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
