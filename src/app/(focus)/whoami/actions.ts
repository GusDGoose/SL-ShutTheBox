"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { hasPin } from "@/lib/auth";
import { WHO_COOKIE, cookieOptions, whoCookieValue } from "@/lib/session";

/**
 * Claim a player for this device. No password — the team PIN is the only real
 * gate; this just says whose thumb is on the screen, so an edit can be
 * attributed and the fika rota knows whose device it is.
 */
export async function chooseIdentity(playerId: string, next: string) {
  // The proxy already gated this route, but a Server Function is a POST to the
  // route it lives on and can be called without going through the UI.
  if (!(await hasPin())) redirect("/pin");

  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("id, is_active")
    .eq("id", playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !(data as { is_active: boolean }).is_active) {
    redirect("/whoami?error=1");
  }

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const jar = await cookies();
  jar.set(WHO_COOKIE, whoCookieValue(playerId), cookieOptions);
  redirect(safeNext);
}

/** Hand the device back, so the next person can say who they are. */
export async function forgetIdentity() {
  const jar = await cookies();
  jar.delete(WHO_COOKIE);
  redirect("/whoami");
}
