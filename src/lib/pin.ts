export const PIN_COOKIE = "stb_pin";

// [concept: hashing] The cookie never holds the PIN itself, only its SHA-256
// digest — so nobody can read the PIN out of a stolen/shared device's cookies.
// Uses Web Crypto (crypto.subtle), which works in every Next.js runtime.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
