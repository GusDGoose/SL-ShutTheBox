import "server-only";
// [concept: server-only guard] The line above makes any client-component import
// of this file a BUILD ERROR — the service-role key can never leak to browsers.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// [concept: generated types] The client is parameterised by the schema that
// `npm run db:types` reads straight out of the local database, so a column
// renamed in a migration becomes a compile error rather than an undefined at
// runtime. Regenerate after every migration; CI diffs the file.
//
// [concept: service-role client] This key bypasses Row Level Security — it is
// the server's master key. It only ever lives in env vars on the server.
export function supabaseAdmin(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — fill in .env.local (see .env.example).",
    );
  }
  // No session persistence: this is a stateless server-side client.
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
