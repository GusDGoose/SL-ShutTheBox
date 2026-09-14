import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { absoluteUrl } from "@/lib/app-url";
import { normalizeCode } from "@/lib/tournament-code";
import { readTournament } from "@/lib/tournament-server";
import { formatAverage, joinNames, winningTeams } from "@/lib/tournament";
import { JoinPanel } from "@/components/tournament/join-panel";
import { TournamentScreen } from "@/components/tournament/tournament-screen";

export const dynamic = "force-dynamic";

// Read once per request, shared by generateMetadata and the page — otherwise
// every render costs two round trips for the same value.
const loadTournament = cache(readTournament);

export async function generateMetadata({ params }: PageProps<"/t/[code]">) {
  const { code } = await params;
  const normalised = normalizeCode(code);
  const snapshot = normalised ? await loadTournament(normalised) : null;
  if (!snapshot) return { title: "Team play · Shut the Box" };

  const winners = winningTeams(snapshot);
  const description =
    snapshot.tournament.status === "finished" && winners.length > 0
      ? `${joinNames(winners.map((t) => t.name))} won with ${formatAverage(
          winners[0]!.average,
        )}.`
      : `Join with the code ${snapshot.tournament.code}.`;

  return { title: `${snapshot.tournament.name} · Team play`, description };
}

/**
 * One URL for the whole event: the lobby while it runs, the result once it is
 * crowned. A spectator's link does not change under them at the moment it
 * matters — which is also what lets the projector and every phone turn over
 * together.
 */
export default async function TournamentPage({ params }: PageProps<"/t/[code]">) {
  const { code } = await params;
  const normalised = normalizeCode(code);
  // A string that could never be a code costs no round trip at all.
  if (!normalised) notFound();
  // Canonical casing, so a link typed in lower case does not leave everybody
  // looking at a different-looking URL from the one on the screen.
  if (normalised !== code) redirect(`/t/${normalised}`);

  const snapshot = await loadTournament(normalised);
  if (!snapshot) notFound();

  // Anyone past both gates is a colleague, and may run the event. A guest with
  // only the code cannot crown or delete it — the database refuses those two
  // without a session — so this only decides whether to offer the buttons.
  const canOrganize = (await getSession()) !== null;
  const joinUrl = await absoluteUrl(`/t/${normalised}`);

  return (
    <TournamentScreen
      initial={snapshot}
      canOrganize={canOrganize}
      joinPanel={
        <JoinPanel
          name={snapshot.tournament.name}
          code={snapshot.tournament.code}
          joinUrl={joinUrl}
        />
      }
    />
  );
}
