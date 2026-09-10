import { redirect } from "next/navigation";

/**
 * Settings moved into /more, which also lists the pages that used to be
 * reachable only from whichever page happened to link to them.
 *
 * A temporary redirect on purpose. permanentRedirect() sends a 308, which
 * browsers cache indefinitely — if the navigation gets reworked again and
 * /settings comes back, everyone who visited once would still be bounced to
 * /more with no way to clear it but their own browser settings.
 */
export default function SettingsPage(): never {
  redirect("/more");
}
