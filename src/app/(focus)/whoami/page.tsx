import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { buttonClass } from "@/components/ui/button";
import type { Player } from "@/lib/types";
import { WhoAmI } from "./who-am-i";

export const dynamic = "force-dynamic";

export const metadata = { title: "Who are you? · Shut the Box" };

export default async function WhoAmIPage({
  searchParams,
}: PageProps<"/whoami">) {
  const { next, error } = await searchParams;
  const { data, error: dbError } = await supabaseAdmin()
    .from("players")
    .select("*")
    .eq("is_active", true)
    .order("created_at");
  if (dbError) throw new Error(dbError.message);

  const players = (data ?? []) as Player[];
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-6 p-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        Who are you?
      </h1>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          That player is not on the active roster any more.
        </p>
      )}

      {players.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-ink-muted">
            Nobody is on the roster yet — somebody has to go first.
          </p>
          <Link href="/players" className={buttonClass("primary", "lg")}>
            Add the first player
          </Link>
        </div>
      ) : (
        <>
          <WhoAmI players={players} next={safeNext} />
          <p className="text-xs text-ink-muted">
            Not on the roster?{" "}
            <Link href="/players" className="font-semibold underline">
              Add yourself
            </Link>
            .
          </p>
        </>
      )}

      <p className="max-w-sm text-xs text-ink-muted">
        This only signs your edits and picks your fika duties — no passwords
        here. You can switch at any time.
      </p>
    </main>
  );
}
