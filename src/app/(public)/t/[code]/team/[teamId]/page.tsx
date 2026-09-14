import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/db-rows";
import { normalizeCode } from "@/lib/tournament-code";
import { readTournament } from "@/lib/tournament-server";
import { teamById } from "@/lib/tournament";
import { TeamScreen } from "@/components/tournament/team-screen";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your team · Shut the Box" };

/** One team's board, driven by that team's phone. */
export default async function TeamPage({
  params,
}: PageProps<"/t/[code]/team/[teamId]">) {
  const { code, teamId } = await params;

  const normalised = normalizeCode(code);
  if (!normalised) notFound();
  if (normalised !== code) redirect(`/t/${normalised}/team/${teamId}`);
  if (!isUuid(teamId)) notFound();

  const snapshot = await readTournament(normalised);
  if (!snapshot || !teamById(snapshot, teamId)) notFound();

  return <TeamScreen initial={snapshot} code={normalised} teamId={teamId} />;
}
