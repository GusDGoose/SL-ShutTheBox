"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PIN_COOKIE, sha256Hex } from "@/lib/pin";

// [concept: Server Action] This function runs ONLY on the server; the browser
// just POSTs the form to it. Secrets like TEAM_PIN never reach the client.
export async function verifyPin(formData: FormData) {
  const attempt = String(formData.get("pin") ?? "");
  const rawNext = String(formData.get("next") ?? "/");
  // [concept: open redirect] Only allow same-site relative paths, otherwise a
  // crafted link could bounce colleagues to an attacker's site after login.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const pin = process.env.TEAM_PIN;
  if (!pin || attempt !== pin) {
    redirect(`/pin?error=1&next=${encodeURIComponent(next)}`);
  }

  const store = await cookies();
  store.set(PIN_COOKIE, await sha256Hex(pin), {
    httpOnly: true, // JS in the browser can't read it
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365, // enter once per device per year
    path: "/",
  });
  redirect(next);
}
