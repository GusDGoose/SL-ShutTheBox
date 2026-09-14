import { normalizeCode } from "@/lib/tournament-code";

/**
 * The `?next=` a gate carries: where to send somebody once they are through.
 *
 * [concept: open redirect] Only same-site relative paths are honoured — a
 * crafted link could otherwise bounce a colleague to somebody else's site the
 * moment they sign in. Anything that is not a single leading slash becomes "/".
 */
export function safeNext(raw: string | null | undefined): string {
  // Collapse repeated leading slashes rather than reject them: "//t/ABC" is
  // what a link built from a mis-pasted APP_URL produced, and the person
  // holding the phone meant "/t/ABC".
  const value = (raw ?? "").replace(/^\/{2,}/, "/");
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/**
 * Routes that need no PIN at all. Somebody sent to the gate on their way to one
 * of these — a stale link, a QR code printed before a fix — should simply be
 * let through: asking for a passcode the destination does not want is the one
 * thing guaranteed to end a team day at the PIN screen.
 *
 * "Public" is narrower than "exempt in src/proxy.ts": the proxy waves ALL of
 * /t/* through, but /t/new then asks for a session itself and would bounce
 * straight back here — a loop. So a path is public exactly when its second
 * segment is a join code, which is the thing that stands in for the PIN.
 */
export function isPublicPath(path: string): boolean {
  const match = /^\/t\/([^/?#]+)/.exec(path);
  return match !== null && normalizeCode(match[1]) !== null;
}
