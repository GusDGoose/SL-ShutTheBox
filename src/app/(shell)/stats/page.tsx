import { SeasonStats } from "@/components/stats/season-stats";
import { stockholmToday } from "@/lib/dates";
import { getSeasonForDate } from "@/lib/queries/stats";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stats · Shut the Box" };

/** The season being played. Older ones live at /stats/season/[id]. */
export default async function StatsPage() {
  const season = await getSeasonForDate(stockholmToday());
  return <SeasonStats season={season} currentId={season.id} />;
}
