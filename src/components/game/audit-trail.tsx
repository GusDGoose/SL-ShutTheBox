import { supabaseAdmin } from "@/lib/supabase";
import type { Player } from "@/lib/types";

type Entry = {
  id: number;
  at: string;
  actor_player_id: string | null;
  action: string;
  note: string | null;
};

const WORDING: Record<string, string> = {
  "game.start": "started this game",
  "game.finish": "crowned it",
  "game.manual": "recorded this game after the fact",
  "game.edit": "corrected the scores",
  "game.delete": "deleted it",
  "game.restore": "restored it",
  "game.undo": "undid the last change",
  "game.abandon": "abandoned it",
  "game.claim_scorekeeper": "took over as scorekeeper",
  "game.photo": "added a photo",
};

// set_game_photo records both directions under one action, telling them
// apart in the note; the wording follows the note rather than the table.
function wordingFor(entry: Entry): string {
  if (entry.action === "game.photo" && entry.note === "photo removed") {
    return "took the photo down";
  }
  return WORDING[entry.action] ?? entry.action;
}

/**
 * Who changed this game, and when.
 *
 * The point of writing an audit trail is that somebody can read it, so it is
 * shown on the game itself rather than only living in the table. Collapsed by
 * default: most games are started and crowned and never touched again.
 */
export async function AuditTrail({ gameId }: { gameId: string }) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("audit_log")
    .select("id, at, actor_player_id, action, note")
    .eq("entity", "game")
    .eq("entity_id", gameId)
    .order("id", { ascending: true });

  const entries = (data ?? []) as Entry[];
  if (entries.length === 0) return null;

  const actorIds = [
    ...new Set(entries.map((e) => e.actor_player_id).filter(Boolean)),
  ] as string[];
  const { data: people } = actorIds.length
    ? await sb.from("players").select("*").in("id", actorIds)
    : { data: [] };
  const names = new Map(
    ((people ?? []) as Player[]).map((p) => [p.id, `${p.emoji} ${p.name}`]),
  );

  const edited = entries.some((e) =>
    ["game.edit", "game.delete", "game.restore", "game.undo"].includes(e.action),
  );

  return (
    <details className="rounded-[var(--radius-control)] border border-line px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">
        History
        {edited && (
          <span className="ml-2 rounded-full bg-brass/20 px-2 py-0.5 text-xs font-semibold text-brass-ink">
            edited
          </span>
        )}
      </summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-muted">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap gap-x-2">
            <span className="font-medium text-ink">
              {entry.actor_player_id
                ? names.get(entry.actor_player_id) ?? "Someone"
                : "The system"}
            </span>
            <span>{wordingFor(entry)}</span>
            <span className="tabular-nums">
              {new Date(entry.at).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
            {/* The photo notes are bookkeeping already said by the wording. */}
            {entry.note && entry.action !== "game.photo" && (
              <span className="w-full italic">&ldquo;{entry.note}&rdquo;</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
