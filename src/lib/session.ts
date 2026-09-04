import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cookie signing for the PIN gate and the per-device identity.
 *
 * Deliberately dependency-free and free of any `next/*` import, because
 * src/proxy.ts needs it: Next 16 runs Proxy on the Node.js runtime, so
 * node:crypto is available there (v1 used Web Crypto purely because the old
 * middleware convention was edge-bound).
 *
 * Server-side only in practice — nothing in src/components imports this.
 */

export const PIN_COOKIE = "stb_pin";
export const WHO_COOKIE = "stb_who";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Namespaced so a PIN signature can never be replayed as an identity one. */
const PIN_PURPOSE = "pin:v1:";
const WHO_PURPOSE = "who:v1:";
const IP_PURPOSE = "ip:v1:";

export class MissingSessionSecretError extends Error {
  constructor() {
    super("SESSION_SECRET is not set");
    this.name = "MissingSessionSecretError";
  }
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  // [concept: fail closed] With no secret we cannot tell a real cookie from a
  // forged one, so nobody gets in and /pin explains why. The alternative —
  // falling back to an unsigned cookie — would quietly remove the gate.
  if (!value) throw new MissingSessionSecretError();
  return value;
}

export function hasSessionSecret(): boolean {
  return Boolean(process.env.SESSION_SECRET);
}

function sign(purpose: string, value: string): string {
  return createHmac("sha256", secret()).update(purpose + value).digest("hex");
}

/**
 * Constant-time comparison of two hex digests. Hashing first means the inputs
 * are always the same length, which matters because timingSafeEqual throws on
 * a length mismatch — and a thrown error is itself a timing signal.
 */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// --- the PIN gate ----------------------------------------------------------

/** The cookie value proving this device knows the team PIN. */
export function pinCookieValue(pin: string): string {
  return sign(PIN_PURPOSE, pin);
}

export function verifyPinCookie(
  cookie: string | undefined,
  pin: string | undefined,
): boolean {
  if (!cookie || !pin || !hasSessionSecret()) return false;
  return sameDigest(cookie, pinCookieValue(pin));
}

/**
 * Whether an entered PIN is the right one. v1 compared with `!==`, which leaks
 * how much of the PIN was correct through response timing.
 */
export function isPinCorrect(
  attempt: string,
  pin: string | undefined,
): boolean {
  if (!pin) return false;
  return sameDigest(sign(PIN_PURPOSE, attempt), sign(PIN_PURPOSE, pin));
}

// --- who is holding this device -------------------------------------------

/** `<playerId>.<signature>` — readable, but not forgeable. */
export function whoCookieValue(playerId: string): string {
  return `${playerId}.${sign(WHO_PURPOSE, playerId)}`;
}

/** The player id this cookie vouches for, or null if it does not. */
export function verifyWhoCookie(cookie: string | undefined): string | null {
  if (!cookie || !hasSessionSecret()) return null;
  const separator = cookie.lastIndexOf(".");
  if (separator <= 0) return null;

  const playerId = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  if (!sameDigest(signature, sign(WHO_PURPOSE, playerId))) return null;
  return playerId;
}

// --- rate limiting ---------------------------------------------------------

/**
 * A stable, opaque key for an address, so throttling never stores anyone's IP.
 * Returns null when there is no address to key on, which is the case in local
 * development.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return sign(IP_PURPOSE, ip);
}

/** The client address, as far as the proxy in front of us reports it. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return headers.get("x-real-ip");
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: COOKIE_MAX_AGE,
  path: "/",
};
