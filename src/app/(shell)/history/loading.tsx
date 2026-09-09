import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Month heading, summary line, then cards — the shape of a real month. */
export default function HistoryLoading() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-4 w-64" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-3 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </main>
  );
}
