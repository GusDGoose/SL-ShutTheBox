import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTeamBoard = vi.fn();
const endTeamTurn = vi.fn();

vi.mock("@/app/(public)/t/actions", () => ({
  setTeamBoard: (...args: unknown[]) => setTeamBoard(...args),
  endTeamTurn: (...args: unknown[]) => endTeamTurn(...args),
  addMember: vi.fn(),
  removeMember: vi.fn(),
}));

import { TeamBoard } from "./team-board";
import { Toaster } from "@/components/ui/toast";
import { parseTournamentSnapshot, type TournamentTeam } from "@/lib/tournament";

const RULES = {
  v: 1,
  tiles: 12,
  scoring: { kind: "sum_open" },
  win: "lowest",
  shut_box: { instant_win: true },
  dice: { count: 2, one_die_rule: { kind: "never" } },
  modifiers: [],
  ties: "share",
  prediction: { enabled: false, sealed: true, penalty: "abs_offset", multiplier: 1 },
  voluntary_stop: { enabled: false },
};

function team(tilesDown: number[] = []): TournamentTeam {
  return {
    id: "team-1",
    name: "Foxes",
    emoji: "🦊",
    song_url: null,
    seq: 1,
    status: "playing",
    member_count: 2,
    played_count: 0,
    sum: null,
    average: null,
    rank: null,
    members: [
      { id: "m1", name: "Anna", turn_order: 1, score: null, tiles_open: null, played_at: null },
      { id: "m2", name: "Bo", turn_order: 2, score: null, tiles_open: null, played_at: null },
    ],
    live: {
      member_id: "m1",
      tiles_down: tilesDown,
      tiles_open: Array.from({ length: 12 }, (_, i) => i + 1).filter(
        (t) => !tilesDown.includes(t),
      ),
      score_if_stop: 78,
      is_shut: false,
    },
  };
}

function snapshotWith(t: TournamentTeam) {
  return parseTournamentSnapshot({
    tournament: {
      id: "t-1",
      code: "FKA429",
      name: "Team day",
      status: "open",
      version: 3,
      ruleset_id: "r-1",
      rules: RULES,
      created_at: "2026-09-16T08:00:00Z",
      updated_at: "2026-09-16T08:00:00Z",
      finished_at: null,
    },
    teams: [t],
    leader_team_ids: [],
    counts: { teams: 1, forming: 0, playing: 1, done: 0, ranked: 0 },
  });
}

/** useToast throws outside a provider, and the board raises one on a refusal. */
function renderBoard(t: TournamentTeam, onSnapshot: () => void = () => {}) {
  return render(
    <Toaster>
      <TeamBoard
        code="FKA429"
        team={t}
        rules={snapshotWith(t).tournament.rules}
        connection="live"
        onSnapshot={onSnapshot}
      />
    </Toaster>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  setTeamBoard.mockReset();
  endTeamTurn.mockReset();
});

describe("TeamBoard", () => {
  it("shows whose turn it is, and where in the round they are", () => {
    renderBoard(team());
    // Scoped to the header line: the name is also in the team list below, which
    // is the point of that list.
    expect(
      screen.getByText((_, node) => node?.textContent === "Anna is up"),
    ).toBeInTheDocument();
    expect(screen.getByText(/turn 1 of 2/i)).toBeInTheDocument();
  });

  it("discards a tap that was queued behind the turn that ended", async () => {
    /**
     * The regression from the daily game (commit b49c357): a tap queued behind
     * an in-flight request survived "End turn" and wrote the previous player's
     * tiles onto the NEXT player's board. The server accepted it, because by
     * then it genuinely was a newer write — so the incoming player started with
     * somebody else's tiles down and would have scored wrong.
     */
    const user = userEvent.setup();
    const first = deferred<unknown>();
    setTeamBoard.mockReturnValueOnce(first.promise);
    endTeamTurn.mockResolvedValue({ ok: true, snapshot: snapshotWith(team()) });

    renderBoard(team());

    // Tap one: in flight, unresolved.
    await user.click(screen.getByRole("button", { name: /^Tile 1 up/ }));
    expect(setTeamBoard).toHaveBeenCalledTimes(1);

    // Tap two: queued behind it, because the first has not come back.
    await user.click(screen.getByRole("button", { name: /^Tile 2 up/ }));
    expect(setTeamBoard).toHaveBeenCalledTimes(1);

    // The turn ends before either lands.
    await user.click(screen.getByRole("button", { name: /end turn/i }));
    await waitFor(() => expect(endTeamTurn).toHaveBeenCalledTimes(1));

    // Now the first request answers. The queued tap belongs to a turn that is
    // over and must never be sent.
    first.resolve({ ok: true, snapshot: snapshotWith(team([1])) });
    await waitFor(() => expect(endTeamTurn).toHaveBeenCalledTimes(1));
    expect(
      setTeamBoard,
      "the queued tap landed on the next player's board",
    ).toHaveBeenCalledTimes(1);
  });

  it("says so when a tap cannot be saved, rather than lying about the board", async () => {
    const user = userEvent.setup();
    setTeamBoard.mockResolvedValue({ ok: false, error: "That team is not playing." });

    renderBoard(team());

    await user.click(screen.getByRole("button", { name: /^Tile 1 up/ }));
    expect(await screen.findByText(/that team is not playing/i)).toBeInTheDocument();
  });
});
