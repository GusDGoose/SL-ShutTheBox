import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { DeadEnd } from "@/components/ui/dead-end";

export default function TournamentNotFound() {
  return (
    <DeadEnd
      art="🎲"
      title="No team play has that code."
      body="Check the six characters on the screen — it is easy to read one wrong. The code may also belong to an event that has been cleared away."
      cta={
        <Link href="/" className={buttonClass("secondary")}>
          Shut the Box
        </Link>
      }
    />
  );
}
