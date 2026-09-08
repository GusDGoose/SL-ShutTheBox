import { NextResponse } from "next/server";
import { hasPin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The photo of the day, as a short-lived signed URL.
 *
 * The bucket is private and the browser key can read nothing from it, so an
 * `<img>` points here and is redirected to a URL that works for an hour. Seeing
 * a photo needs the PIN but not an identity — spectators who never picked a
 * name still get the scrapbook. [concept: signed URL] The object stays private;
 * the signature is what grants access, and it expires.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  if (!UUID.test(gameId)) return new NextResponse("Not found", { status: 404 });
  if (!(await hasPin())) return new NextResponse("Enter the PIN", { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("games")
    .select("photo_path")
    .eq("id", gameId)
    .is("deleted_at", null)
    .maybeSingle();
  const path = (data as { photo_path: string | null } | null)?.photo_path;
  if (!path) return new NextResponse("No photo", { status: 404 });

  const { data: signed, error } = await sb.storage
    .from("game-photos")
    .createSignedUrl(path, 3600);
  if (error || !signed) {
    return new NextResponse("Could not sign the photo", { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    // Private: the redirect target is per-viewer-irrelevant but the PIN gate
    // is not, so nothing shared may cache it. Shorter than the signature.
    headers: { "Cache-Control": "private, max-age=3000" },
  });
}
