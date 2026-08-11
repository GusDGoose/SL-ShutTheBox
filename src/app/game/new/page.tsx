import type { Player } from "@/lib/types";
import { stockholmToday } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";
import { GameScreen } from "@/components/game-screen";

export const dynamic = "force-dynamic";

export default async function NewGamePage() {
  const sb = supabaseAdmin();
  const [playersRes, gamesRes] = await Promise.all([
    sb.from("players").select("*").eq("is_active", true).order("created_at"),
    sb.from("games").select("id").eq("played_on", stockholmToday()),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (gamesRes.error) throw new Error(gamesRes.error.message);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <GameScreen
        players={(playersRes.data ?? []) as Player[]}
        gamesToday={gamesRes.data?.length ?? 0}
      />
    </main>
  );
}
