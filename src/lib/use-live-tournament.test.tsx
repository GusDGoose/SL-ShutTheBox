import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No publishable key in the test environment, so the hook takes the polling
// path — which is the branch worth asserting anyway: Realtime is the nicety,
// polling is what has to work when the office wifi does not.
vi.mock("@/lib/supabase-browser", () => ({
  supabaseBrowser: () => null,
  hasRealtime: () => false,
}));

const fetchTournamentSnapshot = vi.fn();
vi.mock("@/app/(public)/t/actions", () => ({
  fetchTournamentSnapshot: (code: string) => fetchTournamentSnapshot(code),
}));

import { useLiveTournament } from "./use-live-tournament";
import { parseTournamentSnapshot, type TournamentSnapshot } from "./tournament";

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

function snap(version: number, status = "open"): TournamentSnapshot {
  return parseTournamentSnapshot({
    tournament: {
      id: "t-1",
      code: "FKA429",
      name: "Team day",
      status,
      version,
      ruleset_id: "r-1",
      rules: RULES,
      created_at: "2026-09-16T08:00:00Z",
      updated_at: "2026-09-16T08:00:00Z",
      finished_at: status === "finished" ? "2026-09-16T09:00:00Z" : null,
    },
    teams: [],
    leader_team_ids: [],
    counts: { teams: 0, forming: 0, playing: 0, done: 0, ranked: 0 },
  });
}

beforeEach(() => {
  fetchTournamentSnapshot.mockReset();
  fetchTournamentSnapshot.mockResolvedValue({ ok: true, snapshot: snap(1) });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveTournament", () => {
  it("adopts a newer snapshot", async () => {
    const { result } = renderHook(() => useLiveTournament("FKA429", snap(1)));
    act(() => result.current.apply(snap(5)));
    expect(result.current.snapshot.tournament.version).toBe(5);
  });

  it("ignores one that is older than what is on screen", () => {
    const { result } = renderHook(() => useLiveTournament("FKA429", snap(5)));
    act(() => result.current.apply(snap(2)));
    expect(result.current.snapshot.tournament.version).toBe(5);
  });

  it("always adopts the crowning, which is the message nobody may miss", () => {
    const { result } = renderHook(() => useLiveTournament("FKA429", snap(9)));
    // Even arriving with a lower version, a change of status wins: it is what
    // flips every phone in the room from the lobby to the result.
    act(() => result.current.apply(snap(3, "finished")));
    expect(result.current.snapshot.tournament.status).toBe("finished");
  });

  it("polls when there is no Realtime key, and says it is catching up", async () => {
    fetchTournamentSnapshot.mockResolvedValue({ ok: true, snapshot: snap(4) });
    const { result } = renderHook(() => useLiveTournament("FKA429", snap(1)));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() =>
      expect(result.current.snapshot.tournament.version).toBe(4),
    );
    expect(result.current.connection).toBe("polling");
  });

  it("reports a deleted event as gone rather than as offline", async () => {
    fetchTournamentSnapshot.mockResolvedValue({
      ok: false,
      gone: true,
      error: "This team play was deleted.",
    });
    const { result } = renderHook(() => useLiveTournament("FKA429", snap(1)));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => expect(result.current.gone).toBe(true));
  });
});
