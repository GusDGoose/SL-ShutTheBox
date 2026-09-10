import { getIdentity } from "@/lib/auth";
import { isoMonday, stockholmToday } from "@/lib/dates";
import { getFikaCurrent, getFikaHistory } from "@/lib/queries/fika";
import { FikaCard } from "@/components/fika/fika-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fika · Shut the Box" };

/** Who buys, why they buy, and everyone who has bought before. */
export default async function FikaPage() {
  const [duty, history, me] = await Promise.all([
    getFikaCurrent(),
    getFikaHistory(),
    getIdentity(),
  ]);
  const weekStart = isoMonday(stockholmToday());

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Fika rota ☕
        </h1>
        <p className="text-sm text-ink-muted">
          The worst player of the week buys. Nobody buys twice until everybody
          has bought once.
        </p>
      </div>

      <FikaCard duty={duty} weekStart={weekStart} detailed canAct={me !== null} />

      {history.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">Previously</h2>
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li
                key={h.id}
                // Not opacity: dimming the whole row took the muted text to
                // 2.57:1. A skipped week is marked by struck-through text and
                // the word "skipped", which also survives being colour-blind.
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-line px-4 py-3 text-sm"
              >
                <span className="tabular-nums text-ink-muted">
                  w/c {h.week_start}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate font-semibold ${
                    h.skipped ? "line-through decoration-2" : ""
                  }`}
                >
                  {h.emoji} {h.name}
                </span>
                {h.skipped ? (
                  <span className="text-xs text-ink-muted">skipped</span>
                ) : h.reason === "random_fallback" ? (
                  <span className="text-xs text-ink-muted">drawn at random</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
