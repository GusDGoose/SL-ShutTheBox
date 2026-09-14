import { MiniBoard } from "@/components/board/mini-board";
import type { TournamentMember } from "@/lib/tournament";

/**
 * A member's round: the tiles they left standing, and the number. Nothing when
 * they have not rolled. A shut box reads as "📦 0" everywhere it appears.
 */
export function MemberScore({
  member,
  tiles,
  size = "md",
}: {
  member: TournamentMember;
  tiles: number;
  size?: "md" | "lg";
}) {
  if (member.score === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <MiniBoard tiles={tiles} open={member.tiles_open} />
      <span
        className={
          size === "lg"
            ? "font-[family-name:var(--font-display)] text-xl font-bold tabular-nums"
            : "font-semibold tabular-nums"
        }
      >
        {member.score === 0 ? "📦 0" : member.score}
      </span>
    </span>
  );
}
