"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { deleteTournament } from "@/app/(public)/t/actions";

/**
 * Clearing an event away — how a rehearsal gets cleaned up. Offered on the
 * lobby and the result page, so it owns its own confirmation; the dialog only
 * exists on devices that can actually press this.
 */
export function DeleteTournamentButton({
  code,
  body,
}: {
  code: string;
  body: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function handleDelete() {
    setConfirming(false);
    startTransition(async () => {
      const res = await deleteTournament(code);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      router.push("/");
    });
  }

  return (
    <>
      <Button variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
        Delete this team play
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Delete this team play?"
        body={body}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
