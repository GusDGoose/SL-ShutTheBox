import { scoreLabel, type Ruleset } from "@/lib/rules";

/**
 * The running total under the board. The label comes from the ruleset, so a
 * digital-scoring season reads "Digital score if you stop now" rather than
 * quietly meaning something different by the same words.
 */
export function ScoreReadout({
  rules,
  value,
  shut,
  label,
}: {
  rules: Ruleset;
  value: number;
  shut?: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">{label ?? scoreLabel(rules)}</span>
      {shut ? (
        <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold text-shut">
          SHUT THE BOX 📦
        </span>
      ) : (
        <span className="font-[family-name:var(--font-display)] text-5xl font-extrabold tabular-nums">
          {value}
        </span>
      )}
    </div>
  );
}
