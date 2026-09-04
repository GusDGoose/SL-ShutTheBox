"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import {
  PIN_COOKIE,
  clientIp,
  cookieOptions,
  hashIp,
  hasSessionSecret,
  isPinCorrect,
  pinCookieValue,
} from "@/lib/session";

type GateResult = { allowed: boolean; retry_after_seconds: number };

/**
 * [concept: Server Action] Runs only on the server; the browser just POSTs the
 * form to it, so TEAM_PIN never reaches the client.
 */
export async function verifyPin(formData: FormData) {
  const attempt = String(formData.get("pin") ?? "");
  const rawNext = String(formData.get("next") ?? "/");
  // [concept: open redirect] Only same-site relative paths, otherwise a crafted
  // link could bounce colleagues to an attacker's site after they sign in.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  // The annotation is on the variable, not the return position: that is what
  // the compiler needs in order to treat these calls as terminating. Without
  // it, every check below would still have to allow for the values it just
  // rejected, even though redirect() throws.
  const back: (params: string) => never = (params) =>
    redirect(`/pin?${params}&next=${encodeURIComponent(next)}`);

  const pin = process.env.TEAM_PIN;
  if (!pin || !hasSessionSecret()) back("error=config");

  const sb = supabaseAdmin();
  const ip = hashIp(clientIp(await headers()));

  // [concept: rate limiting] A shared four-digit PIN with no lockout can be
  // walked through at request speed, which is what v1 allowed. Backoff starts
  // after five wrong tries and doubles to an hour.
  if (ip) {
    const { data } = await sb.rpc("pin_gate", { p_ip_hash: ip });
    const gate = (data as GateResult[] | null)?.[0];
    if (gate && !gate.allowed) back(`locked=${gate.retry_after_seconds}`);
  }

  if (!isPinCorrect(attempt, pin)) {
    if (ip) {
      const { data } = await sb.rpc("pin_gate", {
        p_ip_hash: ip,
        p_success: false,
      });
      const gate = (data as GateResult[] | null)?.[0];
      if (gate && !gate.allowed) back(`locked=${gate.retry_after_seconds}`);
    }
    back("error=1");
  }

  if (ip) {
    await sb.rpc("pin_gate", { p_ip_hash: ip, p_success: true });
  }

  const jar = await cookies();
  jar.set(PIN_COOKIE, pinCookieValue(pin), cookieOptions);

  // The proxy sends them on to /whoami if this device has not said who it is.
  redirect(next);
}
