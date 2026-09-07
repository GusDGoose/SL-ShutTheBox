import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser's Supabase client — Realtime only.
 *
 * [concept: publishable key] Until now nothing but the server could reach the
 * database at all. This key acts as the `anon` role, which every table denies
 * through RLS with no policies; the single thing it is permitted to do is
 * receive broadcasts on `game:*` topics, per the policy in migration 0011.
 * Reads and writes still go through server actions holding the service key.
 */
let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Unset is a legitimate state: the app still works, just without live
  // updates, falling back to polling.
  if (!url || !key) return null;

  client ??= createClient(url, key, {
    auth: { persistSession: false },
    // Enough for a table of people tapping tiles, without letting a stuck
    // client flood the connection.
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

export function hasRealtime(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
