import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Player } from "@/lib/types";

vi.mock("@/app/(focus)/game/actions", () => ({
  joinGame: vi.fn(),
  leaveGame: vi.fn(),
}));
// The real dialog is a native <dialog showModal>, which jsdom does not have.
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button onClick={onConfirm}>{confirmLabel ?? "Confirm"}</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

import { joinGame, leaveGame } from "@/app/(focus)/game/actions";
import { RosterControls } from "./roster-controls";

function player(id: string, name: string, emoji: string): Player {
  return {
    id, name, emoji,
    song_url: null, song_start_seconds: 0, song_end_seconds: null,
    song_fade_ms: 1500, song_loop: false, song_clip_path: null,
    is_active: true, created_at: "2026-08-01T00:00:00Z",
  };
}

const ROSTER = [
  player("alice", "Alice", "🦊"),
  player("bob", "Bob", "🐙"),
  player("cleo", "Cleo", "🦄"),
  player("dev", "Dev", "🐝"),
];

// Alice rolling, Bob waiting, Cleo done; Dev not in the game.
const IN_GAME = [
  { player_id: "alice", name: "Alice", emoji: "🦊", status: "playing" as const },
  { player_id: "bob", name: "Bob", emoji: "🐙", status: "pending" as const },
  { player_id: "cleo", name: "Cleo", emoji: "🦄", status: "done" as const },
];

const SNAPSHOT = { fake: "snapshot" } as unknown as Parameters<
  React.ComponentProps<typeof RosterControls>["onSnapshot"]
>[0];

beforeEach(() => {
  vi.mocked(joinGame).mockReset().mockResolvedValue({ ok: true, snapshot: SNAPSHOT });
  vi.mocked(leaveGame).mockReset().mockResolvedValue({ ok: true, snapshot: SNAPSHOT });
});

function renderControls(onSnapshot = vi.fn()) {
  render(
    <RosterControls
      gameId="g1"
      players={IN_GAME}
      roster={ROSTER}
      onSnapshot={onSnapshot}
    />,
  );
  return onSnapshot;
}

describe("RosterControls — adding", () => {
  it("offers only the active players who are not already in the game", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: /add a player/i }));
    expect(screen.getByRole("button", { name: /Dev/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Cleo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Alice/ })).toBeNull();
  });

  it("adds the chosen player and hands the new snapshot back", async () => {
    const user = userEvent.setup();
    const onSnapshot = renderControls();
    await user.click(screen.getByRole("button", { name: /add a player/i }));
    await user.click(screen.getByRole("button", { name: /Dev/ }));
    await waitFor(() => expect(joinGame).toHaveBeenCalledWith("g1", "dev"));
    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(SNAPSHOT));
  });

  it("says so when everyone is already in", async () => {
    const user = userEvent.setup();
    render(
      <RosterControls
        gameId="g1"
        players={IN_GAME}
        roster={ROSTER.slice(0, 3)}
        onSnapshot={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add a player/i }));
    expect(screen.getByText(/everyone .* already in/i)).toBeInTheDocument();
  });

  it("shows the database's own refusal", async () => {
    vi.mocked(joinGame).mockResolvedValueOnce({
      ok: false,
      error: "The box was shut — this game is over.",
    });
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: /add a player/i }));
    await user.click(screen.getByRole("button", { name: /Dev/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/box was shut/i);
  });
});

describe("RosterControls — removing", () => {
  it("offers Remove only for players who have not rolled", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "Remove Bob" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Alice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Cleo" })).toBeNull();
  });

  it("asks first, then removes and hands the new snapshot back", async () => {
    const user = userEvent.setup();
    const onSnapshot = renderControls();
    await user.click(screen.getByRole("button", { name: "Remove Bob" }));
    expect(leaveGame).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /remove bob/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(leaveGame).toHaveBeenCalledWith("g1", "bob"));
    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(SNAPSHOT));
  });

  it("does nothing if the scorekeeper changes their mind", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Remove Bob" }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(leaveGame).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
