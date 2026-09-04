import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase";
import {
  PIN_COOKIE,
  WHO_COOKIE,
  verifyPinCookie,
  verifyWhoCookie,
} from "./session";
import type { Player } from "./types";

/**
 * Request-scoped authentication.
 *
 * [concept: server functions are their own entry point] A Server Function is a
 * POST to the route it is used on, reachable without going through any UI, so
 * the Proxy gate in front of the app is not enough on its own — Next's own docs
 * are explicit about this. Every action and route handler starts with
 * requireSession().
 */

export class SessionError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "SessionError";
  }
}

/** Whether this device has entered the team PIN. */
export const hasPin = cache(async (): Promise<boolean> => {
  const jar = await cookies();
  return verifyPinCookie(jar.get(PIN_COOKIE)?.value, process.env.TEAM_PIN);
});

/**
 * Who is holding this device, if they have said. Deduped per request with
 * React.cache so a page and its islands do not each query the roster.
 */
export const getIdentity = cache(async (): Promise<Player | null> => {
  const jar = await cookies();
  const playerId = verifyWhoCookie(jar.get(WHO_COOKIE)?.value);
  if (!playerId) return null;

  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();
  if (error || !data) return null;

  const player = data as Player;
  // A benched player keeps their history but stops being someone you can act
  // as, so a cookie from before they were benched stops counting.
  return player.is_active ? player : null;
});

export type Session = { player: Player };

/**
 * The session every mutation requires: the PIN, plus a named player to put
 * against the change in the audit trail.
 */
export async function requireSession(): Promise<Session> {
  if (!(await hasPin())) throw new SessionError("Enter the team PIN first.");
  const player = await getIdentity();
  if (!player) throw new SessionError("Tell us who you are first.");
  return { player };
}

/** Cron routes carry a shared secret instead of a PIN. */
export function requireCron(request: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new SessionError("CRON_SECRET is not set");

  const provided = request.headers.get("authorization") ?? "";
  const wanted = `Bearer ${expected}`;
  if (provided.length !== wanted.length) throw new SessionError("Bad cron secret");
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(wanted))) {
    throw new SessionError("Bad cron secret");
  }
}
