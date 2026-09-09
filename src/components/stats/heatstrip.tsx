import { ChartFrame } from "./chart-frame";

export type FormDay = { played_on: string; won: boolean };

/** The weekdays in the `weeks` weeks ending on `today`, oldest first. */
function recentWeekdays(today: string, weeks: number): string[] {
  const end = new Date(`${today}T12:00:00Z`);
  const days: string[] = [];
  for (let back = weeks * 7 - 1; back >= 0; back--) {
    const d = new Date(end.getTime() - back * 86_400_000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Form: one square per weekday over the last twelve weeks — won, played, or
 * not there. Weekends are left out because the office does not play them and
 * sixty blank squares would say nothing.
 */
export function Heatstrip({
  days,
  today,
  label,
}: {
  days: FormDay[];
  today: string;
  label: string;
}) {
  const byDay = new Map(days.map((d) => [d.played_on, d.won]));
  const cells = recentWeekdays(today, 12).map((date) => ({
    date,
    state: !byDay.has(date) ? "none" : byDay.get(date) ? "won" : "played",
  }));

  const played = cells.filter((c) => c.state !== "none").length;
  const won = cells.filter((c) => c.state === "won").length;

  const fill = (state: string) =>
    state === "won"
      ? "bg-brass"
      : state === "played"
        ? "bg-ink/25"
        : "bg-surface-2";

  return (
    <ChartFrame
      title="Form"
      label={`${label} played ${played} of the last ${cells.length} weekdays and won ${won}.`}
      columns={["Day", "Result"]}
      rows={cells
        .filter((c) => c.state !== "none")
        .map((c) => [c.date, c.state === "won" ? "won the day" : "played"])}
      footnote="Brass is a day won, grey a day played. Weekends are not shown."
    >
      <div className="grid grid-flow-col grid-rows-5 gap-1">
        {cells.map((c) => (
          <span
            key={c.date}
            title={`${c.date}: ${
              c.state === "won" ? "won" : c.state === "played" ? "played" : "—"
            }`}
            className={`aspect-square w-full min-w-3 rounded-[3px] ${fill(c.state)}`}
          />
        ))}
      </div>
    </ChartFrame>
  );
}
