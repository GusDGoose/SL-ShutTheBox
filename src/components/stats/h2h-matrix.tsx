import type { Player } from "@/lib/types";

export type H2HRow = {
  a_id: string;
  b_id: string;
  meetings: number;
  a_wins: number;
  b_wins: number;
  ties: number;
};

/**
 * Who beats whom, read across the row.
 *
 * Columns are headed by emoji alone, with the name in a screen-reader-only
 * span: twelve full names across the top would make the grid four screens
 * wide, and everyone here knows their colleagues by their emoji anyway.
 */
export function H2HMatrix({
  players,
  rows,
}: {
  players: Pick<Player, "id" | "name" | "emoji">[];
  rows: H2HRow[];
}) {
  const byPair = new Map(rows.map((r) => [`${r.a_id}:${r.b_id}`, r]));

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">
          Head to head record, read as wins–losses for the player named in each
          row against the player in each column.
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th
              scope="col"
              className="eyebrow sticky left-0 z-10 bg-surface px-3 py-2.5 text-left"
            >
              <span className="sr-only">Player</span>
            </th>
            {players.map((p) => (
              <th
                key={p.id}
                scope="col"
                className="px-2 py-2.5 text-center text-base"
              >
                <span aria-hidden>{p.emoji}</span>
                <span className="sr-only">{p.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((a) => (
            <tr key={a.id} className="border-b border-line/60 last:border-0">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface px-3 py-2.5 text-left font-medium whitespace-nowrap"
              >
                <span aria-hidden>{a.emoji}</span> {a.name}
              </th>
              {players.map((b) => {
                if (a.id === b.id) {
                  return (
                    <td
                      key={b.id}
                      className="bg-surface-2/60 px-2 py-2.5 text-center text-ink-muted"
                    >
                      <span aria-hidden>·</span>
                      <span className="sr-only">not applicable</span>
                    </td>
                  );
                }
                const h = byPair.get(`${a.id}:${b.id}`);
                if (!h) {
                  return (
                    <td
                      key={b.id}
                      className="px-2 py-2.5 text-center text-ink-muted"
                    >
                      <span aria-hidden>–</span>
                      <span className="sr-only">never met</span>
                    </td>
                  );
                }
                // Ahead on the head-to-head gets the brass tint; level is left
                // plain rather than coloured, because level is not a result.
                const ahead = h.a_wins > h.b_wins;
                return (
                  <td
                    key={b.id}
                    className={`px-2 py-2.5 text-center tabular-nums ${
                      ahead ? "font-semibold text-brass-ink" : ""
                    }`}
                  >
                    {h.a_wins}–{h.b_wins}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
