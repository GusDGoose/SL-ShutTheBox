"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Hands the link to somebody else.
 *
 * Web Share where the browser has it — on a phone that is the sheet with
 * Teams, Messages and everything else in it, which is exactly where this link
 * is going. Everywhere else it copies, and says so, because a button that
 * silently succeeds is indistinguishable from one that silently fails.
 *
 * The URL is built in the browser rather than passed in: window.location.origin
 * is always right, including on a preview deployment where APP_URL is not.
 */
export function ShareButton({
  path,
  title,
  label,
  variant = "secondary",
}: {
  /** Relative, e.g. "/t/FKA429". */
  path: string;
  title: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ kind: "success", title: "Link copied" });
      // One timer: two quick taps must not let the first one flip the label
      // back early.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // A cancelled share sheet lands here too, which is not an error worth
      // shouting about. Only say something when there is nothing to fall back
      // on at all.
      if (!navigator.share) {
        toast({
          kind: "error",
          title: "Could not copy the link",
          body: url,
        });
      }
    }
  }

  return (
    <Button variant={variant} onClick={share}>
      {copied ? (
        <Check aria-hidden size={16} />
      ) : (
        <Share2 aria-hidden size={16} />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}
