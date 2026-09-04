"use client";

import { useEffect } from "react";
import { ErrorCard } from "@/components/ui/error-card";

// Sits below the shell layout on purpose: when the database is unreachable you
// keep the header and tabs, so you can still get to Settings or retry from
// another page instead of being stranded on a dead end.
export default function ShellError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error.digest ?? error.message, error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col">
      <ErrorCard digest={error.digest} retry={retry} showHomeLink={false} />
    </main>
  );
}
