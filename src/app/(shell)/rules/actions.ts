"use server";

import { revalidatePath } from "next/cache";
import { requireSession, SessionError } from "@/lib/auth";
import { describeDbError } from "@/lib/db-errors";
import { supabaseAdmin } from "@/lib/supabase";
import { rpc } from "@/lib/db-rows";
import type { ActionResult } from "@/app/(focus)/game/actions";

/**
 * Choosing what the next season plays.
 *
 * Only ever the NEXT quarter: the database refuses to re-rule a season already
 * in progress, because that would rescore games that have already been played.
 */
export async function planSeason(
  rulesetId: string,
  name?: string,
): Promise<ActionResult> {
  try {
    const { player } = await requireSession();
    const sb = supabaseAdmin();

    const { data: start, error: startError } = await sb.rpc("next_quarter_start");
    if (startError) return { ok: false, error: describeDbError(startError) };

    const { error } = await rpc(sb, "plan_season", {
      p_actor: player.id,
      p_quarter_start: start,
      p_ruleset_id: rulesetId,
      p_name: name?.trim() || null,
    });
    if (error) return { ok: false, error: describeDbError(error) };

    revalidatePath("/rules");
    return { ok: true };
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.message };
    throw e;
  }
}
