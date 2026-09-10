"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { drawFika, skipFika } from "@/app/(shell)/fika/actions";
import type { FikaDuty } from "@/lib/queries/fika";

/**
 * Who is buying fika this week.
 *
 * Shown on Today as a one-liner and on /fika with the reasoning, because the
 * reasoning is the whole point: "worst last week, average finish 0.83 over 3
 * games" ends an argument that "you lost" does not.
 */
export function FikaCard({
  duty,
  weekStart,
  detailed = false,
  canAct,
}: {
  duty: FikaDuty | null;
  /** The ISO Monday this card is about — used when there is nothing to show. */
  weekStart: string;
  detailed?: boolean;
  /** False for a device that has not said who is holding it. */
  canAct: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast({ kind: "error", title: res.error ?? "That did not work." });
      else router.refresh();
    });

  if (!duty) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <span aria-hidden className="text-2xl">
          ☕
        </span>
        <p className="min-w-0 flex-1 text-sm text-ink-muted">
          Nobody is down to buy fika this week yet.
        </p>
        {canAct && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => drawFika(weekStart))}
            className={buttonClass("secondary")}
          >
            {pending ? "Drawing…" : "Draw a name"}
          </button>
        )}
      </section>
    );
  }

  const why =
    duty.reason === "worst_last_week"
      ? `Worst last week — average finish ${Number(duty.detail.badness ?? 0).toFixed(2)} over ${duty.detail.games ?? 0} game${duty.detail.games === 1 ? "" : "s"}.`
      : "Nobody eligible played last week, so this one was drawn at random.";

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="text-2xl">
          ☕
        </span>
        <p className="min-w-0 flex-1">
          <span className="font-semibold">
            {duty.emoji} {duty.name}
          </span>{" "}
          buys fika this week.
        </p>
        {detailed ? (
          canAct && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(true)}
              className={buttonClass("ghost")}
            >
              Not this week
            </button>
          )
        ) : (
          <Link href="/fika" className={buttonClass("ghost")}>
            Rota →
          </Link>
        )}
      </div>

      {detailed && (
        <>
          <p className="text-sm text-ink-muted">{why}</p>
          <p className="text-xs text-ink-muted">
            {duty.duties_total === 1
              ? "Their first turn."
              : `Their ${duty.duties_total}${ordinal(duty.duties_total)} turn.`}{" "}
            Nobody buys twice until everyone has bought once.
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title="Skip this week?"
        body={`${duty.name} keeps their place in the rota — someone else is drawn for this week instead.`}
        confirmLabel="Skip and redraw"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          run(() => skipFika(duty.id));
        }}
      />
    </section>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
