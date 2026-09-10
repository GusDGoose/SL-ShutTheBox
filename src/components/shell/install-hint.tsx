"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/**
 * "Add it to your home screen."
 *
 * Two shapes, because the two platforms disagree. Chrome fires
 * `beforeinstallprompt`, which can be saved and replayed from a button.
 * Safari fires nothing and has no API at all, so iOS gets instructions.
 *
 * Hidden entirely once installed — nagging somebody to install the thing
 * they are standing inside is the kind of detail that makes an app feel
 * unfinished.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * [concept: useSyncExternalStore for browser facts] Whether the app is running
 * standalone is a value that lives outside React and does not exist on the
 * server. Reading it in an effect and calling setState would render the hint
 * and then rip it away on every visit; this renders the truth from the first
 * committed paint, and the server snapshot says "installed" so nothing is
 * ever sent down only to be hidden.
 */
function useStandalone(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari's own non-standard flag, still the only signal on iOS.
      (window.navigator as { standalone?: boolean }).standalone === true,
    () => true,
  );
}

function useIsIos(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => /iphone|ipad|ipod/i.test(window.navigator.userAgent),
    () => false,
  );
}

export function InstallHint() {
  const standalone = useStandalone();
  const ios = useIsIos();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // or Chrome shows its own bar instead of our button
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed) return null;
  // Nothing useful to say: not iOS, and Chrome has not offered.
  if (!ios && !deferred) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">On your phone</h2>
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brass/20 text-brass-ink">
          <Download aria-hidden size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Add it to your home screen</p>
          <p className="text-xs text-ink-muted">
            {ios
              ? "Tap Share, then “Add to Home Screen”. It opens without the browser bars, so the board gets the whole screen."
              : "It opens without the browser bars, so the board gets the whole screen."}
          </p>
        </div>
        {deferred && (
          <button
            type="button"
            className={buttonClass("secondary")}
            onClick={async () => {
              await deferred.prompt();
              const { outcome } = await deferred.userChoice;
              // The event is single-use; a second prompt() throws.
              setDeferred(null);
              if (outcome === "accepted") setInstalled(true);
            }}
          >
            Install
          </button>
        )}
      </div>
    </section>
  );
}
