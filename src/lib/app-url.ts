import { headers } from "next/headers";

/**
 * The app's own absolute URL, for the things that cannot be relative: the QR
 * code on the team-play lobby and the buttons on the Teams cards.
 *
 * APP_URL is the answer in production, but it is only trusted for its ORIGIN.
 * The value in Vercel was pasted from a browser's address bar while the PIN
 * page was open, so for a month it read `https://…/pin?next=%2F` — and every
 * link built by appending a path to it led to the PIN gate first. Nobody
 * noticed on the Teams cards, because the gate then sends you on to Today.
 * The QR code for a team day noticed: a guest with no PIN has nowhere to go.
 *
 * When APP_URL is unset or unparseable, the request's own forwarded headers are
 * the fallback — local development, and preview deployments, where the URL
 * differs per deploy and a QR must point at THIS host.
 */

/** Scheme and host only, or null when there is nothing usable. */
export function appOrigin(appUrl: string | undefined): string | null {
  const raw = (appUrl ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** The pure half, so the fallback can be tested without a request. */
export function baseUrlFrom(
  appUrl: string | undefined,
  proto: string | null,
  host: string | null,
): string {
  const configured = appOrigin(appUrl);
  if (configured) return configured;
  if (!host) return "";
  // A forwarded host already carries its port; localhost is the only place the
  // protocol is not https, and that is exactly what the header reports.
  return `${proto ?? "https"}://${host}`;
}

/**
 * `path` must start with "/". Returns a relative URL when there is no way to
 * know the host — a link still works, a QR code simply will not be rendered.
 */
export async function absoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const base = baseUrlFrom(
    process.env.APP_URL,
    h.get("x-forwarded-proto"),
    h.get("x-forwarded-host") ?? h.get("host"),
  );
  return base ? `${base}${path}` : path;
}
