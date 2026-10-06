import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { PlayerCard as Card } from "@/lib/player-cards";
import type { Player } from "@/lib/types";
import { PlayerCard } from "./player-card";

const MARINA: Player = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Marina",
  emoji: "🦩",
  song_url: "https://youtu.be/dQw4w9WgXcQ",
  song_start_seconds: 0,
  song_end_seconds: null,
  song_fade_ms: 1500,
  song_loop: false,
  song_clip_path: null,
  is_active: true,
  created_at: "2026-08-01T00:00:00Z",
};

function card(extra: Partial<Card> = {}): Card {
  return {
    player: MARINA,
    rating: 1062,
    rank: 1,
    weekDelta: 14,
    games: 22,
    wins: 9,
    winPct: 41,
    avg: 28.3,
    lowest: 0,
    shutBoxes: 2,
    streak: 2,
    fika: 1,
    titles: 1,
    badges: [
      { key: "season_champion", name: "Season champion", emoji: "🏆" },
      { key: "regular_25", name: "Regular", emoji: "🪑" },
      { key: "shut_the_box", name: "Shut the box", emoji: "📦" },
    ],
    moreBadges: 2,
    badgeCount: 5,
    form: [
      { position: 3, of: 6, won: false, shut: false },
      { position: 1, of: 6, won: true, shut: true },
    ],
    ...extra,
  };
}

function renderCard(c: Card, opts: { song?: string | null; isMe?: boolean } = {}) {
  return render(
    <ul>
      <PlayerCard card={c} song={opts.song ?? null} isMe={opts.isMe ?? false} />
    </ul>,
  );
}

describe("PlayerCard", () => {
  it("is one link to the player's profile", () => {
    renderCard(card());
    expect(screen.getByRole("link", { name: /Marina/ })).toHaveAttribute(
      "href",
      `/players/${MARINA.id}`,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("says when it is you", () => {
    renderCard(card(), { isMe: true });
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("names the song", () => {
    renderCard(card(), { song: "Never Gonna Give You Up" });
    expect(screen.getByText("Never Gonna Give You Up")).toBeInTheDocument();
  });

  it("shows a few badges by name for screen readers, and how many more", () => {
    renderCard(card());
    const badges = screen.getByRole("list", { name: /badges/i });
    expect(within(badges).getByText("Season champion")).toBeInTheDocument();
    expect(within(badges).getByText("+2")).toBeInTheDocument();
  });

  it("shows a shut box as the lowest score it is", () => {
    renderCard(card());
    expect(screen.getByText("📦 0")).toBeInTheDocument();
  });

  it("gives the recent form, newest last", () => {
    renderCard(card());
    const form = screen.getByRole("list", { name: /last 2 games/i });
    const items = within(form).getAllByRole("listitem");
    expect(items.at(-1)).toHaveTextContent(/won/i);
  });

  it("has nothing to count yet for a player who has not played", () => {
    renderCard(
      card({
        rating: null,
        rank: null,
        weekDelta: null,
        games: 0,
        wins: 0,
        winPct: null,
        avg: null,
        lowest: null,
        shutBoxes: 0,
        streak: 0,
        fika: 0,
        titles: 0,
        badges: [],
        moreBadges: 0,
        badgeCount: 0,
        form: [],
      }),
    );
    expect(screen.getByText(/no games yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /badges/i })).not.toBeInTheDocument();
  });
});
