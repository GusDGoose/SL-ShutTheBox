import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SoundToggle } from "@/components/shell/sound-toggle";

// Focus routes — the board, the PIN gate, choosing who you are — get a minimal
// bar instead of the shell's tabs, so nothing competes with the thing you came
// here to do.
export default function FocusLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="flex items-center justify-between gap-4 px-3 py-2">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft aria-hidden size={18} />
          Today
        </Link>
        <SoundToggle />
      </header>
      <div className="flex-1">{children}</div>
    </>
  );
}
