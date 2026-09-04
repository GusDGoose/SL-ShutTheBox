import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Top bar for focus routes (the board, a finished game). Focus routes have no
 * tab rail so the board owns the screen — which means they must offer their own
 * way out. v1's game page had no navigation at all.
 */
export function FocusBar({
  title,
  backHref = "/",
  backLabel = "Today",
  children,
}: {
  title?: ReactNode;
  backHref?: string;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="wood flex items-center gap-3 border-b border-black/25 px-4 py-3 text-ivory">
      <Link
        href={backHref}
        className="-ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-ivory/80 transition-colors hover:text-ivory"
      >
        <ChevronLeft aria-hidden size={18} />
        {backLabel}
      </Link>
      {title && (
        <h1 className="flex-1 truncate text-center font-[family-name:var(--font-display)] text-base font-semibold">
          {title}
        </h1>
      )}
      <div className="flex items-center gap-1">{children}</div>
    </header>
  );
}
