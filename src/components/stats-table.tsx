import type { ReactNode } from "react";

// Shared table styling for the stats page. Wide tables scroll horizontally
// inside their own container so the page never does.
export function StatsTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left dark:border-white/10">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold opacity-70">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
