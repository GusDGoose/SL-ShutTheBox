import { NextResponse } from "next/server";
import { hasPin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A player's uploaded song clip, as a short-lived signed URL.
 *
 * Fetched by the Web Audio clip player at the crowning, which needs the bytes
 * rather than an embed so it can trim and fade exactly. Same gate as photos:
 * the PIN, not an identity — everyone at the table hears the anthem.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;
  if (!UUID.test(playerId)) return new NextResponse("Not found", { status: 404 });
  if (!(await hasPin())) return new NextResponse("Enter the PIN", { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("players")
    .select("song_clip_path")
    .eq("id", playerId)
    .maybeSingle();
  const path = (data as { song_clip_path: string | null } | null)?.song_clip_path;
  if (!path) return new NextResponse("No clip", { status: 404 });

  const { data: signed, error } = await sb.storage
    .from("song-clips")
    .createSignedUrl(path, 3600);
  if (error || !signed) {
    return new NextResponse("Could not sign the clip", { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=3000" },
  });
}
