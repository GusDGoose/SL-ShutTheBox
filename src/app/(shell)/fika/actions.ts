"use server";

import { revalidatePath } from "next/cache";
import { requireSession, SessionError } from "@/lib/auth";
import { describeDbError } from "@/lib/db-errors";
import { supabaseAdmin } from "@/lib/supabase";
import type { ActionResult } from "@/app/(focus)/game/actions";

/**
 * Turning down the fika duty, and drawing one for a week that has none.
 *
 * Both need a named player rather than just the PIN — a skip is recorded
 * against whoever pressed it, and "somebody skipped, nobody knows who" is
 * exactly the argument this rota exists to prevent.
 */
async function withSession<T = object>(
  run: (actorId: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const { player } = await requireSession();
    return await run(player.id);
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.message };
    throw e;
  }
}

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
