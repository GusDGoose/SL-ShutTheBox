import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/**
 * Covers /stats and, by nesting, /stats/all-time and /stats/season/[id].
 *
 * Shaped like the real page — heading, period pills, season strip, then a
 * table — so the layout does not jump when a dozen view queries land.
 */
export default function StatsLoading() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-14 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <SkeletonRows rows={5} />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <SkeletonRows rows={4} />
      </div>
    </main>
  );
}
