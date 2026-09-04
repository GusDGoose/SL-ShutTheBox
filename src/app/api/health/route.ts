import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Diagnostic endpoint (excluded from the PIN gate in proxy.ts). Reports config
// SHAPE, never values: booleans + pattern checks + the DB error message.
export async function GET() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const report: Record<string, unknown> = {
    env: {
      SUPABASE_URL_set: url.length > 0,
      SUPABASE_SERVICE_ROLE_KEY_set: key.length > 0,
      TEAM_PIN_set: (process.env.TEAM_PIN ?? "").length > 0,
      // Without this the app fails closed and nobody gets past /pin, so it is
      // the first thing to check after a deploy locks the office out.
      SESSION_SECRET_set: (process.env.SESSION_SECRET ?? "").length > 0,
      CRON_SECRET_set: (process.env.CRON_SECRET ?? "").length > 0,
      TEAMS_WEBHOOK_URL_set: (process.env.TEAMS_WEBHOOK_URL ?? "").length > 0,
      // https://<ref>.supabase.co — or 127.0.0.1 for the local stack
      url_looks_like_supabase: /^https?:\/\/[a-z0-9.]+(\.supabase\.co|:54321)\/?$/.test(url),
      // secret keys start sb_secret_ (new) or eyJ (legacy service_role JWT);
      // sb_publishable_ here would mean the WRONG key was pasted
      key_looks_secret: /^(sb_secret_|eyJ)/.test(key),
      key_looks_publishable: key.startsWith("sb_publishable_"),
    },
  };

  try {
    const { count, error } = await supabaseAdmin()
      .from("players")
      .select("*", { count: "exact", head: true });
    report.db = error
      ? { ok: false, code: error.code, message: error.message }
      : { ok: true, players_in_roster: count };
  } catch (e) {
    report.db = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(report);
}
