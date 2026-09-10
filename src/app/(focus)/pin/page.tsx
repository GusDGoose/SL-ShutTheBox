import { verifyPin } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { hasSessionSecret } from "@/lib/session";

function lockoutLabel(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} minutes` : "an hour";
}

export default async function PinPage({
  searchParams,
}: {
  // [concept: async request APIs] In Next 15+, searchParams is a Promise.
  searchParams: Promise<{ error?: string; next?: string; locked?: string }>;
}) {
  const { error, next, locked } = await searchParams;

  // Both are required, and the app fails closed without either, so the page
  // says exactly which one is missing rather than just refusing every PIN.
  const missing = [
    !process.env.TEAM_PIN && "TEAM_PIN",
    !hasSessionSecret() && "SESSION_SECRET",
  ].filter(Boolean) as string[];

  const lockedFor = locked ? Number.parseInt(locked, 10) : 0;

  return (
    <main className="felt flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div aria-hidden className="text-6xl">
        🎲
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ivory">
        Shut the Box
      </h1>
      <p className="text-sm text-ivory/80">Enter the team PIN to get in.</p>

      {missing.length > 0 && (
        <p className="max-w-sm rounded-[var(--radius-control)] bg-amber-100 px-4 py-3 text-sm text-amber-900">
          {missing.join(" and ")} {missing.length > 1 ? "are" : "is"} not
          configured on the server, so nobody can get in. Set{" "}
          {missing.length > 1 ? "them" : "it"} in <code>.env.local</code> (or the
          Vercel environment variables) and redeploy.
        </p>
      )}

      <form action={verifyPin} className="flex flex-col items-center gap-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        {/* A placeholder is not a label: it disappears the moment you type,
            and a screen reader announcing "PIN" only until the first digit
            is worse than useless on the one field that gates the whole app. */}
        <label htmlFor="pin" className="sr-only">
          Team PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="PIN"
          disabled={lockedFor > 0}
          aria-invalid={Boolean(error)}
          className="w-44 rounded-[var(--radius-control)] border-2 border-brass/60 bg-black/20 px-4 py-3 text-center text-2xl tracking-[0.5em] text-ivory outline-none placeholder:text-ivory/40 focus:border-brass disabled:opacity-50"
        />

        {error === "1" && (
          <p role="alert" className="text-sm font-semibold text-ivory">
            Wrong PIN — try again.
          </p>
        )}
        {error === "config" && (
          <p role="alert" className="text-sm font-semibold text-ivory">
            The server is not configured yet.
          </p>
        )}
        {lockedFor > 0 && (
          <p role="alert" className="max-w-xs text-sm font-semibold text-ivory">
            Too many tries. The box is locked for {lockoutLabel(lockedFor)}.
          </p>
        )}

        <button
          type="submit"
          disabled={lockedFor > 0}
          className={buttonClass("primary")}
        >
          Open the box
        </button>
      </form>
    </main>
  );
}
