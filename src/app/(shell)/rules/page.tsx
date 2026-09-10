import { Board } from "@/components/board/board";
import { SeasonBanner } from "@/components/shell/season-banner";
import { getIdentity } from "@/lib/auth";
import { stockholmToday } from "@/lib/dates";
import { boardTiles, describeRules, parseRuleset, scoreOf } from "@/lib/rules";
import { supabaseAdmin } from "@/lib/supabase";
import type { RulesetRow } from "@/lib/rules";
import { PlanNextSeason } from "./plan-next-season";

export const dynamic = "force-dynamic";

export const metadata = { title: "House rules · Shut the Box" };

type SeasonRow = {
  id: string;
  slug: string;
  number: number;
  name: string;
  starts_on: string;
  ends_on: string;
  ruleset_id: string;
};

export default async function RulesPage() {
  const sb = supabaseAdmin();
  const today = stockholmToday();
  const me = await getIdentity();

  // The season containing today, created on demand if this quarter is new.
  const { data: seasonId, error: seasonError } = await sb.rpc("ensure_season", {
    p_date: today,
  });
  if (seasonError) throw new Error(seasonError.message);

  const [seasonsRes, rulesetsRes, nextStartRes] = await Promise.all([
    sb.from("seasons").select("*").order("starts_on", { ascending: false }),
    sb.from("rulesets").select("*").order("name"),
    sb.rpc("next_quarter_start"),
  ]);
  if (seasonsRes.error) throw new Error(seasonsRes.error.message);
  if (rulesetsRes.error) throw new Error(rulesetsRes.error.message);

  const seasons = (seasonsRes.data ?? []) as SeasonRow[];
  // rules is Json in the generated types; RulesetRow narrows it to the
  // shape parseRuleset validates at the point of use.
  const rulesets = (rulesetsRes.data ?? []) as unknown as RulesetRow[];
  const byId = new Map(rulesets.map((r) => [r.id, r]));

  const current = seasons.find((s) => s.id === seasonId);
  if (!current) throw new Error("this quarter has no season");
  const currentRules = parseRuleset(byId.get(current.ruleset_id)!.rules);

  const nextStart = nextStartRes.data as string | null;
  const planned = seasons.find((s) => s.starts_on === nextStart);
  const plannedRuleset = planned ? byId.get(planned.ruleset_id) : undefined;

  const sections = describeRules(currentRules);
  const tiles = boardTiles(currentRules);
  // Worked from the ruleset rather than written down, so the example can never
  // contradict what the app actually scores.
  const exampleOpen = tiles.length >= 5 ? [3, 5] : [1, 2];
  const exampleScore = scoreOf(currentRules, exampleOpen);

  const past = seasons.filter((s) => s.ends_on < today);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        House rules
      </h1>

      <SeasonBanner
        season={{ ...current, rules: currentRules }}
      />

      {/* The board as it will actually look this season. */}
      <section className="flex flex-col gap-2">
        <h2 className="eyebrow">The box</h2>
        <Board rules={currentRules} down={new Set()} />
      </section>

      <dl className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.heading} className="flex flex-col gap-1">
            <dt className="font-[family-name:var(--font-display)] text-lg font-bold">
              {section.heading}
            </dt>
            <dd className="text-ink-muted">{section.body}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <h2 className="eyebrow">For example</h2>
        <p>
          Tiles{" "}
          <span className="font-semibold">
            {exampleOpen.join(" and ")}
          </span>{" "}
          left standing scores{" "}
          <span className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums">
            {exampleScore}
          </span>
          .
        </p>
        <p className="text-xs text-ink-muted">
          Worked out by the same code that scores your turns, so this cannot
          drift from what actually happens.
        </p>
      </section>

      {/* Later seasons may run a variant, which has to be chosen before the
          quarter starts — the database refuses to re-rule one in progress. */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
        <h2 className="eyebrow">Next season</h2>
        {planned && plannedRuleset ? (
          <p className="text-sm">
            From{" "}
            <span className="font-semibold">
              {new Date(`${planned.starts_on}T12:00:00Z`).toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "long" },
              )}
            </span>{" "}
            it is <span className="font-semibold">{planned.name}</span>, playing{" "}
            <span className="font-semibold">{plannedRuleset.name}</span>.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            Nothing planned yet — the next quarter will carry on with the
            vanilla rules unless somebody picks otherwise.
          </p>
        )}

        <PlanNextSeason
          rulesets={rulesets.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
          }))}
          currentId={planned?.ruleset_id ?? current.ruleset_id}
          knowsWho={me !== null}
        />
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Seasons gone by</h2>
          <ul className="flex flex-col gap-1 text-sm text-ink-muted">
            {past.map((season) => (
              <li key={season.id}>
                <span className="font-semibold text-ink">
                  Season {season.number}
                </span>{" "}
                {season.name} · {byId.get(season.ruleset_id)?.name} ·{" "}
                {season.starts_on} to {season.ends_on}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
