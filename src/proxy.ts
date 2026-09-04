import { NextResponse, type NextRequest } from "next/server";
import {
  PIN_COOKIE,
  WHO_COOKIE,
  verifyPinCookie,
  verifyWhoCookie,
} from "@/lib/session";

// Routes past the PIN that must not require an identity yet: /whoami is where
// you choose one, and /players is where a new colleague adds themselves to the
// roster before they can pick it.
const IDENTITY_EXEMPT = ["/whoami", "/players"];

// [concept: proxy (formerly "middleware")] Runs before every matched request,
// in front of the app — the right place for auth gates. Next 16 renamed the
// middleware convention to proxy and runs it on the Node.js runtime, which is
// why the cookie signing can use node:crypto.
export async function proxy(request: NextRequest) {
  // Gate one: does this device know the team PIN?
  //
  // Fails CLOSED: with TEAM_PIN or SESSION_SECRET unconfigured nobody gets in,
  // and /pin says which is missing — safer than silently opening the app.
  const knowsPin = verifyPinCookie(
    request.cookies.get(PIN_COOKIE)?.value,
    process.env.TEAM_PIN,
  );
  if (!knowsPin) return redirectTo(request, "/pin");

  // Gate two: who is holding it? An edit has to be attributable, and the fika
  // rota needs to know whose device this is.
  const knowsWho =
    verifyWhoCookie(request.cookies.get(WHO_COOKIE)?.value) !== null;
  const { pathname } = request.nextUrl;
  const exempt = IDENTITY_EXEMPT.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
  if (!knowsWho && !exempt) return redirectTo(request, "/whoami");

  return NextResponse.next();
}

function redirectTo(request: NextRequest, destination: string) {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  // v1 forwarded only the pathname, so a deep link carrying query parameters
  // lost them on the way through the gate.
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.search = `?next=${encodeURIComponent(next)}`;
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
