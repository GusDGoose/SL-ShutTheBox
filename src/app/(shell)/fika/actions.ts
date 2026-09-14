"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth";
import { describeDbError } from "@/lib/db-errors";
import { supabaseAdmin } from "@/lib/supabase";
import type { ActionResult } from "@/lib/action-result";


/** Not this week — mark it skipped and draw a replacement for the same week. */
export async function skipFika(dutyId: string): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("skip_fika", {
      p_actor: actorId,
      p_duty_id: dutyId,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    revalidatePath("/fika");
    revalidatePath("/");
    return { ok: true };
  });
}

/**
 * Draw for a week that has no duty. The Monday cron normally does this; the
 * button exists for the Monday it did not fire, or the first week ever.
 */
export async function drawFika(weekStart: string): Promise<ActionResult> {
  return withSession(async (actorId) => {
    const { error } = await supabaseAdmin().rpc("draw_fika", {
      p_week_start: weekStart,
      p_actor: actorId,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    revalidatePath("/fika");
    revalidatePath("/");
    return { ok: true };
  });
}
