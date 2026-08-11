import "server-only";
// [concept: server-only guard] The line above makes any client-component import
// of this file a BUILD ERROR — the service-role key can never leak to browsers.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// [concept: service-role client] This key bypasses Row Level Security — it is
// the server's master key. It only ever lives in env vars on the server.
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — fill in .env.local (see .env.example).",
    );
  }
  // No session persistence: this is a stateless server-side client.
  return createClient(url, key, { auth: { persistSession: false } });
}
