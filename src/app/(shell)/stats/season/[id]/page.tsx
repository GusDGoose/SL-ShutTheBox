import { notFound, redirect } from "next/navigation";
import { SeasonStats } from "@/components/stats/season-stats";
import { stockholmToday } from "@/lib/dates";
import { getSeasonForDate, getSeasons } from "@/lib/queries/stats";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: PageProps<"/stats/season/[id]">) {
  const { id } = await params;
  const season = (await getSeasons()).find((s) => s.id === id);
  return {
    title: season
      ? `Season ${season.number} · Shut the Box`
      : "Season · Shut the Box",
  };
}

export default async function SeasonStatsPage({
  params,
}: PageProps<"/stats/season/[id]">) {
  const { id } = await params;
  // A malformed id would otherwise reach Postgres and come back as 22P02 —
  // a 500 for what is really a bad link.
  if (!UUID.test(id)) notFound();

  const [seasons, current] = await Promise.all([
    getSeasons(),
    getSeasonForDate(stockholmToday()),
  ]);

  const season = seasons.find((s) => s.id === id);
  if (!season) notFound();
  // One canonical URL for the season being played, so the nav's "This season"
  // pill and a bookmarked season link cannot disagree.
  if (season.id === current.id) redirect("/stats");

  return <SeasonStats season={season} currentId={current.id} />;
}
