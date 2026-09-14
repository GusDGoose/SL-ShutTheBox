import { SkeletonCard } from "@/components/ui/skeleton";

export default function LoadingTournament() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <SkeletonCard />
      <SkeletonCard />
    </main>
  );
}
