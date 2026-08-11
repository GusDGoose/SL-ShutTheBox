import { NextResponse, type NextRequest } from "next/server";
import { PIN_COOKIE, sha256Hex } from "@/lib/pin";

// [concept: proxy (formerly "middleware")] Runs before every matched request,
// in front of the app — the right place for auth gates. Next 16 renamed the
// middleware convention to proxy.
export async function proxy(request: NextRequest) {
  const pin = process.env.TEAM_PIN;
  const cookie = request.cookies.get(PIN_COOKIE)?.value;

  // Fail CLOSED: if TEAM_PIN is unconfigured, nobody gets in (the /pin page
  // explains the misconfiguration) — safer than silently opening the app.
  if (pin && cookie === (await sha256Hex(pin))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/pin";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the PIN page itself and Next's static assets.
  matcher: ["/((?!pin|_next/static|_next/image|favicon.ico).*)"],
};
