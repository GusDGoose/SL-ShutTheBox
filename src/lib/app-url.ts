import { headers } from "next/headers";

/**
 * The app's own absolute URL, for the things that cannot be relative.
 *
 * A QR code is the case that forces this: it is rendered on the SERVER, into an
 * SVG, and a camera pointed at it has no idea what host the page came from.
 *
 * APP_URL is the answer in production, but it is optional (see .env.example)
 * and unset in local development, so the request's own forwarded headers are
 * the fallback. Vercel sets both; `next start` sets host alone.
 */

/** The pure half, so the fallback can be tested without a request. */
export function baseUrlFrom(
  appUrl: string | undefined,
  proto: string | null,
  host: string | null,
): string {
  const configured = (appUrl ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (!host) return "";
  // A forwarded host already carries its port; localhost is the only place the
  // protocol is not https, and that is exactly what the header reports.
  return `${proto ?? "https"}://${host}`.replace(/\/+$/, "");
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
