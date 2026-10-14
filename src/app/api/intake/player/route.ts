import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireIntake, SessionError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Machine entry point for the "deltagartillstånd" intake flow in Power Automate.
 *
 * A new colleague's paper application is scanned, approved and given a permit
 * number; the flow then POSTs here to put them on the roster, the one thing it
 * cannot do itself. This mirrors how a colleague adds themselves in the UI
 * (createPlayer in src/app/(shell)/players/actions.ts) — name and emoji only,
 * the song is theirs to set later — but is reached with a bearer secret instead
 * of the PIN cookie, the same machine-to-machine pattern as the cron routes.
 *
 * The permit number is not a column: the register of applications lives in
 * SharePoint, and the app only needs the roster row. It is recorded in the
 * audit trail instead, so "who added this player, and under which permit" is
 * answerable in plain SQL without a schema change.
 *
 *   POST /api/intake/player
 *   Authorization: Bearer <INTAKE_SECRET>
 *   { "name": "Ada Lovelace", "emoji": "🎲", "permit_no": "SL-STB-2026-0001" }
 */
export async function POST(request: Request) {
  try {
    requireIntake(request);
  } catch (e) {
    if (e instanceof SessionError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // `null`, a string or an array is valid JSON too, and would otherwise reach
  // the field reads below as a TypeError (a 500) or as silent nonsense.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const emoji =
    (typeof fields.emoji === "string" ? fields.emoji.trim() : "") || "🎲";
  const permitNo =
    typeof fields.permit_no === "string" ? fields.permit_no.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("players")
    .insert({ name, emoji })
    .select("id, name, emoji")
    .single();

  if (error) {
    // 23505 = Postgres unique_violation (players.name is unique). A re-run of
    // the same approved application should not read as a server error.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `"${name}" is already on the roster.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // System actor (null): the flow did it, not a player. Same convention the
  // cron jobs follow. The note carries the permit so the trail is self-contained.
  await sb.from("audit_log").insert({
    actor_player_id: null,
    action: "player.create",
    entity: "player",
    entity_id: data.id,
    after: data,
    note: permitNo
      ? `added via deltagartillstånd intake; permit ${permitNo}`
      : "added via deltagartillstånd intake",
  });

  // Same as createPlayer: the roster page must not keep serving the old list.
  revalidatePath("/players");

  return NextResponse.json(
    { id: data.id, name: data.name, emoji: data.emoji, permit_no: permitNo || null },
    { status: 201 },
  );
}
