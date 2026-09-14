"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createTournament } from "@/app/(public)/t/actions";

export function NewTournamentForm({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ kind: "error", title: "Give it a name first" });
      return;
    }
    startTransition(async () => {
      const res = await createTournament(trimmed);
      if (!res.ok) {
        toast({ kind: "error", title: res.error });
        return;
      }
      router.push(`/t/${res.code}`);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        What is the occasion?
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          autoComplete="off"
          className={inputClass}
        />
        <span className="text-xs text-ink-muted">
          Everybody who joins sees this.
        </span>
      </label>

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Setting up…" : "Create it 🎲"}
      </Button>
    </form>
  );
}
