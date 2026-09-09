import { redirect } from "next/navigation";
import { stockholmToday } from "@/lib/dates";
import { monthOf } from "@/lib/months";

export const dynamic = "force-dynamic";

/** The history is browsed by month; this month is where it opens. */
export default function HistoryPage() {
  redirect(`/history/${monthOf(stockholmToday())}`);
}
