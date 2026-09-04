import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clientIp,
  hashIp,
  hasSessionSecret,
  isPinCorrect,
  pinCookieValue,
  verifyPinCookie,
  verifyWhoCookie,
  whoCookieValue,
} from "@/lib/session";

const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_SECRET = "test-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PLAYER = "8f2c9a71-0000-4000-8000-000000000001";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("the PIN cookie", () => {
  it("does not contain the PIN itself", () => {
    const cookie = pinCookieValue("1234");
    expect(cookie).not.toContain("1234");
    expect(cookie).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies against the PIN it was signed for", () => {
    expect(verifyPinCookie(pinCookieValue("1234"), "1234")).toBe(true);
  });

  // Rotating TEAM_PIN is the kill switch for every device.
  it("stops verifying once the PIN changes", () => {
    expect(verifyPinCookie(pinCookieValue("1234"), "9999")).toBe(false);
  });

  it("cannot be forged without the secret", () => {
    const forged = pinCookieValue("1234");
    process.env.SESSION_SECRET = OTHER_SECRET;
    expect(verifyPinCookie(forged, "1234")).toBe(false);
  });

  it("rejects junk, empty and missing cookies", () => {
    expect(verifyPinCookie(undefined, "1234")).toBe(false);
    expect(verifyPinCookie("", "1234")).toBe(false);
    expect(verifyPinCookie("nonsense", "1234")).toBe(false);
    // A plain SHA-256 of the PIN was the v1 cookie: it must not be accepted.
    expect(
      verifyPinCookie(
        "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
        "1234",
      ),
    ).toBe(false);
  });

  // [concept: fail closed] With no secret there is no way to tell a real cookie
  // from a forged one, so nothing is trusted.
  it("trusts nothing when the secret is missing", () => {
    const cookie = pinCookieValue("1234");
    delete process.env.SESSION_SECRET;
    expect(hasSessionSecret()).toBe(false);
    expect(verifyPinCookie(cookie, "1234")).toBe(false);
  });
});

describe("isPinCorrect", () => {
  it("accepts the right PIN and rejects everything else", () => {
    expect(isPinCorrect("1234", "1234")).toBe(true);
    expect(isPinCorrect("1235", "1234")).toBe(false);
    expect(isPinCorrect("", "1234")).toBe(false);
    // A wrong PIN sharing a prefix must be no more "nearly right" than any
    // other, which is the point of comparing digests.
    expect(isPinCorrect("123", "1234")).toBe(false);
    expect(isPinCorrect("12345", "1234")).toBe(false);
  });

  it("rejects everything when no PIN is configured", () => {
    expect(isPinCorrect("1234", undefined)).toBe(false);
    expect(isPinCorrect("", undefined)).toBe(false);
  });
});

describe("the identity cookie", () => {
  it("names the player it vouches for", () => {
    expect(verifyWhoCookie(whoCookieValue(PLAYER))).toBe(PLAYER);
  });

  it("keeps the id readable but the signature attached", () => {
    const cookie = whoCookieValue(PLAYER);
    expect(cookie.startsWith(`${PLAYER}.`)).toBe(true);
  });

  // Otherwise anyone could sign their edits as a colleague by editing a cookie.
  it("rejects a swapped player id", () => {
    const cookie = whoCookieValue(PLAYER);
    const signature = cookie.slice(cookie.lastIndexOf(".") + 1);
    const someoneElse = "8f2c9a71-0000-4000-8000-000000000002";
    expect(verifyWhoCookie(`${someoneElse}.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const cookie = whoCookieValue(PLAYER);
    expect(verifyWhoCookie(cookie.slice(0, -1) + "0")).toBeNull();
  });

  it("rejects an unsigned id", () => {
    expect(verifyWhoCookie(PLAYER)).toBeNull();
    expect(verifyWhoCookie(`${PLAYER}.`)).toBeNull();
    expect(verifyWhoCookie(".sig")).toBeNull();
    expect(verifyWhoCookie(undefined)).toBeNull();
  });

  it("cannot be forged without the secret", () => {
    const cookie = whoCookieValue(PLAYER);
    process.env.SESSION_SECRET = OTHER_SECRET;
    expect(verifyWhoCookie(cookie)).toBeNull();
  });

  // The two cookies are signed with different namespaces, so one can never be
  // presented as the other.
  it("does not accept a PIN signature as an identity", () => {
    expect(verifyWhoCookie(`${PLAYER}.${pinCookieValue(PLAYER)}`)).toBeNull();
  });
});

describe("hashIp", () => {
  it("is stable for the same address and different for another", () => {
    expect(hashIp("203.0.113.7")).toBe(hashIp("203.0.113.7"));
    expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
  });

  it("never stores the address itself", () => {
    expect(hashIp("203.0.113.7")).not.toContain("203.0.113");
  });

  it("returns nothing when there is no address, as in local development", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp("")).toBeNull();
  });
});

describe("clientIp", () => {
  it("takes the first hop from x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("returns null when neither header is present", () => {
    expect(clientIp(new Headers())).toBeNull();
  });
});
