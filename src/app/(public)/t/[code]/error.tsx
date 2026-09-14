"use client";

import { useEffect } from "react";
import { ErrorCard } from "@/components/ui/error-card";

// Next 16 passes `retry`, not `reset`. And no "Back to Today" link: for a guest
// with no PIN that button is a one-way trip to the gate.
export default function TournamentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Team play error:", error.digest ?? error.message, error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col">
      <ErrorCard digest={error.digest} retry={retry} showHomeLink={false} />
    </main>
  );
}
