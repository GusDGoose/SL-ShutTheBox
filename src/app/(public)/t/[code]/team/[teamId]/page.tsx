import { notFound, redirect } from "next/navigation";
import { rpc } from "@/lib/db-rows";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeCode } from "@/lib/tournament-code";
import { parseTournamentSnapshot, teamById } from "@/lib/tournament";
import { TeamScreen } from "@/components/tournament/team-screen";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Your team · Shut the Box" };

/** One team's board, driven by that team's phone. */
export default async function TeamPage({
  params,
}: PageProps<"/t/[code]/team/[teamId]">) {
  const { code, teamId } = await params;

  const normalised = normalizeCode(code);
  if (!normalised) notFound();
  if (normalised !== code) redirect(`/t/${normalised}/team/${teamId}`);
  // A malformed id would reach Postgres as 22P02 and surface as a 500 rather
  // than a not-found, which is the trap the game page already documents.
  if (!UUID.test(teamId)) notFound();

  const { data, error } = await rpc(
    supabaseAdmin(),
    "tournament_snapshot_by_code",
    { p_code: normalised },
  );
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const snapshot = parseTournamentSnapshot(data);
  if (!teamById(snapshot, teamId)) notFound();

  return <TeamScreen initial={snapshot} code={normalised} teamId={teamId} />;
}
