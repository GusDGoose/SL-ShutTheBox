"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { planSeason } from "./actions";

type Option = { id: string; name: string; description: string };

/**
 * Picking the rules for the quarter after this one.
 *
 * Only the next season can be set: changing the rules of one already being
 * played would rescore games that are already done, which the database refuses.
 */
export function PlanNextSeason({
  rulesets,
  currentId,
  knowsWho,
}: {
  rulesets: Option[];
  currentId: string;
  knowsWho: boolean;
}) {
  const [rulesetId, setRulesetId] = useState(currentId);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (!knowsWho) {
    return (
      <Link
        href="/whoami?next=/rules"
        className="self-start text-sm font-semibold text-ink-muted underline hover:text-ink"
      >
        Say who you are to plan the next season
      </Link>
    );
  }

  const chosen = rulesets.find((r) => r.id === rulesetId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label htmlFor="ruleset" className="text-xs font-semibold">
          Rules
        </label>
        <select
          id="ruleset"
          value={rulesetId}
          onChange={(e) => setRulesetId(e.target.value)}
          className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm"
        >
          {rulesets.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {chosen && (
          <p className="text-xs text-ink-muted">{chosen.description}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="season-name" className="text-xs font-semibold">
          Call it something (optional)
        </label>
        <input
          id="season-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Digital Autumn"
          className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>

      <Button
        variant="secondary"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await planSeason(rulesetId, name);
            toast(
              res.ok
                ? { kind: "success", title: "Next season is set" }
                : { kind: "error", title: res.error },
            );
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "Setting…" : "Plan next season"}
      </Button>
    </div>
  );
}
