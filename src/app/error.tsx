"use client";

import { useEffect } from "react";
import { ErrorCard } from "@/components/ui/error-card";

// [concept: error boundary] v1 had none, so any Supabase hiccup showed the raw
// Postgres message on an unstyled Next error page.
// Next 16 renamed this prop from `reset` to `retry`.
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error.digest ?? error.message, error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col">
      <ErrorCard digest={error.digest} retry={retry} />
    </main>
  );
}
