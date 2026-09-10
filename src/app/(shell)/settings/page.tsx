import { permanentRedirect } from "next/navigation";

// Settings moved into /more, which also lists the pages that used to be
// reachable only from whichever page happened to link to them. Kept as a
// redirect: the gear pointed here for two months and people bookmark things.
export default function SettingsPage(): never {
  permanentRedirect("/more");
}
