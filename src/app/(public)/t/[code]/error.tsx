"use client";

import { ErrorCard } from "@/components/ui/error-card";

export default function TournamentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-10">
      <ErrorCard digest={error.digest} retry={reset} />
    </main>
  );
}
