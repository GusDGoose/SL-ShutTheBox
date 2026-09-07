"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { restoreGame } from "@/app/(focus)/game/[id]/edit/actions";

/**
 * A deleted game still opens.
 *
 * [concept: soft delete is visible] The row is kept so the mistake can be
 * examined and reversed, which is no use if the page just says "not found" —
 * that was this page's behaviour when soft delete first landed, and it made a
 * deleted game indistinguishable from a bad link.
 */
export function DeletedBanner({
  gameId,
  knowsWho,
}: {
  gameId: string;
  /**
   * Restoring is a change to the history, so it needs a name against it. This
   * is the third place the same trap has appeared — the play page, taking over
   * as scorekeeper, and now this — so if a fourth turns up it is worth a shared
   * helper rather than another prop: offering a control that is certain to be
   * refused leaves the user with no way forward.
   */
  knowsWho: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-danger/50 bg-danger/10 px-4 py-3">
      <p className="flex-1 text-sm">
        <span className="font-semibold">This game is deleted.</span> It does not
        count towards anybody&apos;s stats, but nothing has been thrown away.
      </p>
      {knowsWho ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await restoreGame(gameId);
              toast(
                res.ok
                  ? { kind: "success", title: "Restored — it counts again" }
                  : { kind: "error", title: res.error },
              );
              router.refresh();
            })
          }
        >
          {pending ? "Restoring…" : "Restore"}
        </Button>
      ) : (
        <Link
          href={`/whoami?next=/game/${gameId}`}
          className="text-sm font-semibold underline"
        >
          Say who you are to restore it
        </Link>
      )}
    </div>
  );
}
