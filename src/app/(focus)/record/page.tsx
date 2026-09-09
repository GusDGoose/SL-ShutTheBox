import { requireIdentityPage } from "@/lib/auth";
import { stockholmToday } from "@/lib/dates";
import { parseRuleset } from "@/lib/rules";
import { getRoster, getSeasons } from "@/lib/queries/stats";
import { supabaseAdmin } from "@/lib/supabase";
import { RecordGameForm } from "@/components/game/record-game-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Record a game · Shut the Box" };

/**
 * A game that was played without the app — on the real box, on a day the app
 * was down, or before anyone remembered to open it.
 *
 * Needs a named player, not just the PIN: the record says who entered it,
 * and "recorded this game after the fact" appears in the audit trail.
 */
export default async function RecordGamePage() {
  await requireIdentityPage("/record");

  const [roster, seasons, fallback] = await Promise.all([
    getRoster(),
    getSeasons(),
    // What ensure_season() assigns to a quarter nobody has planned — the
    // form needs it to draw the right board for a date outside every season.
    supabaseAdmin().from("rulesets").select("rules").eq("slug", "vanilla-12").single(),
  ]);
  if (fallback.error) throw new Error(fallback.error.message);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <RecordGameForm
        roster={roster.filter((p) => p.is_active)}
        seasons={seasons.map((s) => ({
          starts_on: s.starts_on,
          ends_on: s.ends_on,
          rules: s.rules,
        }))}
        defaultRules={parseRuleset(fallback.data.rules)}
        today={stockholmToday()}
      />
    </main>
  );
}
