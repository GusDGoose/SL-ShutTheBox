import { verifyPin } from "./actions";

export default async function PinPage({
  searchParams,
}: {
  // [concept: async request APIs] In Next 15+, searchParams is a Promise.
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const misconfigured = !process.env.TEAM_PIN;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-6xl">🎲</div>
      <h1 className="text-2xl font-bold">Shut the Box</h1>
      <p className="text-sm opacity-70">Enter the team PIN to get in.</p>

      {misconfigured && (
        <p className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          TEAM_PIN is not configured on the server — set it in .env.local (or
          Vercel env vars) and restart.
        </p>
      )}

      <form action={verifyPin} className="flex flex-col items-center gap-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="PIN"
          className="w-40 rounded-xl border border-black/20 bg-transparent px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-black/60 dark:border-white/20 dark:focus:border-white/60"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Wrong PIN — try again.
          </p>
        )}
        <button
          type="submit"
          className="rounded-xl bg-foreground px-6 py-3 font-semibold text-background transition-transform active:scale-95"
        >
          Open the box
        </button>
      </form>
    </main>
  );
}
