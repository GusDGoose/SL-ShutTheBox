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

// [concept: exact-segment exemptions] The v1 matcher excluded the bare prefixes
// "pin" and "api/health", so any future route STARTING with those letters
// (/pinboard, /api/healthcheck) would have been silently un-gated. Route
// exemptions below are anchored with (?:$|/), which src/proxy.test.ts asserts
// against Next's own matcher.
//
// The dots in the file exemptions are NOT literal: Next compiles matchers with
// path-to-regexp, and "favicon\.ico$" still exempts a hypothetical
// /faviconXico (verified). Harmless — no such route exists — but don't lean on
// the escape for anything that matters.
//
// The PWA manifest and icons must be exempt because the browser fetches them
// WITHOUT cookies — gated, they redirect to /pin and the app can't be installed.
// Cron routes carry their own CRON_SECRET instead of a PIN.
export const config = {
  matcher: [
    "/((?!pin(?:$|/)|api/health(?:$|/)|api/cron(?:$|/)|_next/static|_next/image|favicon\.ico$|manifest\.webmanifest$|robots\.txt$|sitemap\.xml$|icons/|sfx/|icon\.svg$|icon\.png$|apple-icon\.png$).*)",
  ],
};
