import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Player } from "@/lib/types";
import type { Ruleset } from "@/lib/rules";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));
vi.mock("@/app/(focus)/game/[id]/edit/actions", () => ({
  addManualGame: vi.fn(),
}));

import { addManualGame } from "@/app/(focus)/game/[id]/edit/actions";
import { RecordGameForm, rulesFor } from "./record-game-form";

const VANILLA: Ruleset = {
  v: 1,
  tiles: 12,
  scoring: { kind: "sum_open" },
  win: "lowest",
  shut_box: { instant_win: true },
  dice: { count: 2, one_die_rule: { kind: "when_all_above_shut", threshold: 6 } },
  modifiers: [],
  ties: "share",
  prediction: { enabled: false, sealed: true, penalty: "abs_offset", multiplier: 1 },
  voluntary_stop: { enabled: false },
};

const TODAY = "2026-09-08";

function player(id: string, name: string, emoji: string): Player {
  return {
    id,
    name,
    emoji,
    song_url: null,
    song_start_seconds: 0,
    song_end_seconds: null,
    song_fade_ms: 1500,
    song_loop: false,
    song_clip_path: null,
    is_active: true,
    created_at: "2026-08-01T00:00:00Z",
  };
}

const ALICE = player("alice", "Alice", "🦊");
const BOB = player("bob", "Bob", "🐙");

function renderForm() {
  return render(
    <RecordGameForm
      roster={[ALICE, BOB]}
      seasons={[]}
      defaultRules={VANILLA}
      today={TODAY}
    />,
  );
}

beforeEach(() => {
  vi.mocked(addManualGame).mockReset();
  vi.mocked(addManualGame).mockResolvedValue({ ok: true, gameId: "g1" });
  pushMock.mockReset();
});

describe("rulesFor", () => {
  const nine: Ruleset = { ...VANILLA, tiles: 9 };
  const seasons = [{ starts_on: "2026-07-01", ends_on: "2026-09-30", rules: nine }];

  it("uses the ruleset of the season containing the date", () => {
    expect(rulesFor("2026-08-15", seasons, VANILLA).tiles).toBe(9);
  });

  it("falls back to what ensure_season would assign outside every season", () => {
    expect(rulesFor("2019-01-01", seasons, VANILLA).tiles).toBe(12);
  });
});

describe("RecordGameForm", () => {
  it("defaults the date to today and will not accept a later one", () => {
    renderForm();
    const date = screen.getByLabelText("Played on") as HTMLInputElement;
    expect(date.value).toBe(TODAY);
    expect(date.max).toBe(TODAY);
  });

  it("lists picked players in the order they were tapped", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /Bob/ }));
    await user.click(screen.getByRole("button", { name: /Alice/ }));
    const scores = screen.getAllByRole("spinbutton");
    expect(scores.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Score for Bob",
      "Score for Alice",
    ]);
  });

  it("will not submit until every picked player has a score or never got a turn", async () => {
    const user = userEvent.setup();
    renderForm();
    const submit = () => screen.getByRole("button", { name: /record the game/i });
    expect(submit()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Alice/ }));
    expect(submit()).toBeDisabled();

    await user.type(screen.getByLabelText("Score for Alice"), "12");
    expect(submit()).toBeEnabled();
  });

  it("refuses a score the board cannot produce", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await user.type(screen.getByLabelText("Score for Alice"), "79");
    expect(screen.getByRole("alert")).toHaveTextContent(/78/);
    expect(screen.getByRole("button", { name: /record the game/i })).toBeDisabled();
  });

  it("sends typed scores with no tiles, in turn order", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /Bob/ }));
    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await user.type(screen.getByLabelText("Score for Bob"), "8");
    await user.type(screen.getByLabelText("Score for Alice"), "5");
    await user.click(screen.getByRole("button", { name: /record the game/i }));

    await waitFor(() => expect(addManualGame).toHaveBeenCalledTimes(1));
    expect(addManualGame).toHaveBeenCalledWith(
      TODAY,
      [
        { playerId: "bob", status: "done", score: 8, tilesOpen: null },
        { playerId: "alice", status: "done", score: 5, tilesOpen: null },
      ],
      undefined,
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/game/g1"));
  });

  it("sends a player who never got a turn as dnp", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await user.click(screen.getByRole("button", { name: /Bob/ }));
    await user.type(screen.getByLabelText("Score for Alice"), "3");
    await user.click(screen.getByRole("button", { name: "Bob never got a turn" }));
    await user.click(screen.getByRole("button", { name: /record the game/i }));

    await waitFor(() => expect(addManualGame).toHaveBeenCalledTimes(1));
    const results = vi.mocked(addManualGame).mock.calls[0]![1];
    expect(results[1]).toEqual({
      playerId: "bob",
      status: "dnp",
      score: null,
      tilesOpen: null,
    });
  });

  it("derives the score from the tiles when the board is used", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await user.click(screen.getByRole("button", { name: "Set Alice's tiles" }));

    // Every tile starts up, as on the live board; tap the ones knocked down.
    expect(screen.getAllByRole("button", { name: /^Tile \d+ / })).toHaveLength(12);
    await user.click(screen.getByRole("button", { name: /^Tile 12 up/ }));
    expect(screen.getByText("66")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: /record the game/i }));
    await waitFor(() => expect(addManualGame).toHaveBeenCalledTimes(1));
    const results = vi.mocked(addManualGame).mock.calls[0]![1];
    expect(results[0]).toEqual({
      playerId: "alice",
      status: "done",
      score: 66,
      tilesOpen: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    });
  });

  it("passes the note along when one is written", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await user.type(screen.getByLabelText("Score for Alice"), "4");
    await user.type(screen.getByLabelText(/note/i), "the app was down");
    await user.click(screen.getByRole("button", { name: /record the game/i }));
    await waitFor(() => expect(addManualGame).toHaveBeenCalledTimes(1));
    expect(vi.mocked(addManualGame).mock.calls[0]![2]).toBe("the app was down");
  });

  it("shows the server's refusal and stays on the page", async () => {
    vi.mocked(addManualGame).mockResolvedValueOnce({
      ok: false,
      error: "That date has not happened yet.",
    });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await user.type(screen.getByLabelText("Score for Alice"), "4");
    await user.click(screen.getByRole("button", { name: /record the game/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That date has not happened yet.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
