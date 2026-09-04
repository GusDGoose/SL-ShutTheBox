"use client";

import { useEffect, useRef } from "react";
import { Button } from "./button";

/**
 * Confirmation for anything destructive or surprising — abandoning a game,
 * deleting one, taking over as scorekeeper.
 *
 * [concept: native dialog] <dialog showModal> gives focus trapping, Escape to
 * close and inert background for free, which a div-based modal has to
 * reimplement (usually badly).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Escape and the backdrop both mean "cancel".
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-6 text-ink shadow-[var(--shadow-card)] backdrop:bg-black/50"
    >
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
        {title}
      </h2>
      {body && <p className="mt-2 text-sm text-ink-muted">{body}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
