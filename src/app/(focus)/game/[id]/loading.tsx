import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingGame() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <Skeleton className="h-6 w-40" />
      {/* Same proportions as the tray, so the page does not jump when it lands. */}
      <Skeleton className="aspect-[6/2] w-full rounded-[var(--radius-card)] sm:aspect-[12/3]" />
      <Skeleton className="h-14 w-32" />
    </main>
  );
}
