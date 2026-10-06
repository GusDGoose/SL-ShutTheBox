import { describe, expect, it } from "vitest";
import { buildPlayerCards, type PlayerCardInput } from "@/lib/player-cards";
import type {
  AchievementRow,
  Player,
  PlayerRatingRow,
  PlayerStatsRow,
  PlayerStreakRow,
} from "@/lib/types";

const TODAY = "2026-10-06";

function player(id: string, name: string, extra: Partial<Player> = {}): Player {
  return {
    id,
    name,
    emoji: "🎲",
    song_url: null,
    song_start_seconds: 0,
    song_end_seconds: null,
    song_fade_ms: 1500,
    song_loop: false,
    song_clip_path: null,
    is_active: true,
    created_at: "2026-08-01T00:00:00Z",
    ...extra,
  };
}

function stats(id: string, extra: Partial<PlayerStatsRow> = {}): PlayerStatsRow {
  return {
    player_id: id,
    name: id,
    emoji: "🎲",
    is_active: true,
    games_played: 10,
    wins: 3,
    win_pct: 30,
    avg_score: 31.5,
    best_score: 7,
    worst_score: 60,
    avg_finish: 2.4,
    shut_boxes: 0,
    last_played_on: "2026-10-05",
    dnp_count: 0,
    ...extra,
  } as PlayerStatsRow;
}

function rating(id: string, value: number, extra: Partial<PlayerRatingRow> = {}): PlayerRatingRow {
  return {
    player_id: id,
    name: id,
    emoji: "🎲",
    is_active: true,
    rating: value,
    rated_games: 10,
    peak_rating: value,
    below_peak: 0,
    is_established: true,
    ...extra,
  };
}

const CATALOG: AchievementRow[] = [
  { key: "first_blood", name: "First blood", description: "", emoji: "🩸", sort: 10, repeatable: false },
  { key: "shut_the_box", name: "Shut the box", description: "", emoji: "📦", sort: 20, repeatable: false },
  { key: "streak_3", name: "Hat trick", description: "", emoji: "🔥", sort: 30, repeatable: false },
  { key: "regular_25", name: "Regular", description: "", emoji: "🪑", sort: 40, repeatable: false },
  { key: "season_champion", name: "Champion", description: "", emoji: "🏆", sort: 50, repeatable: true },
];

function input(extra: Partial<PlayerCardInput> = {}): PlayerCardInput {
  return {
    roster: [player("ada", "Ada"), player("ben", "Ben"), player("cleo", "Cleo")],
    stats: [stats("ada"), stats("ben")],
    streaks: [],
    ratings: [rating("ada", 1010), rating("ben", 1040)],
    weekDelta: new Map(),
    fika: new Map(),
    catalog: CATALOG,
    earned: [],
    form: [],
    monthlyChampions: [],
    seasonChampions: [],
    ...extra,
  };
}

describe("buildPlayerCards", () => {
  it("puts the rated players first, highest rating on top, with their rank", () => {
    const { active } = buildPlayerCards(input(), TODAY);
    expect(active.map((c) => c.player.name)).toEqual(["Ben", "Ada", "Cleo"]);
    expect(active.map((c) => c.rank)).toEqual([1, 2, null]);
  });

  it("ranks only players who have actually been rated, as the profile does", () => {
    const { active } = buildPlayerCards(
      input({
        ratings: [rating("ada", 1010), rating("ben", 1000, { rated_games: 0 })],
      }),
      TODAY,
    );
    expect(active.find((c) => c.player.id === "ada")!.rank).toBe(1);
    expect(active.find((c) => c.player.id === "ben")!.rank).toBeNull();
  });

  it("sorts players with games but no rating before those with none, then by name", () => {
    const { active } = buildPlayerCards(
      input({
        roster: [player("zed", "Zed"), player("ada", "Ada"), player("bo", "Bo")],
        stats: [stats("zed")],
        ratings: [],
      }),
      TODAY,
    );
    expect(active.map((c) => c.player.name)).toEqual(["Zed", "Ada", "Bo"]);
    expect(active[1]!.games).toBe(0);
    expect(active[1]!.lowest).toBeNull();
  });

  it("reports the lowest score as it is, zero included", () => {
    const { active } = buildPlayerCards(
      input({ stats: [stats("ada", { best_score: 0, shut_boxes: 2 }), stats("ben")] }),
      TODAY,
    );
    const ada = active.find((c) => c.player.id === "ada")!;
    expect(ada.lowest).toBe(0);
    expect(ada.shutBoxes).toBe(2);
  });

  it("rounds the 7-day movement and leaves it out when nothing moved", () => {
    const { active } = buildPlayerCards(
      input({ weekDelta: new Map([["ada", 12.4], ["ben", 0.2]]) }),
      TODAY,
    );
    expect(active.find((c) => c.player.id === "ada")!.weekDelta).toBe(12);
    expect(active.find((c) => c.player.id === "ben")!.weekDelta).toBeNull();
  });

  it("shows the three hardest-won badges a player holds, and how many more", () => {
    const { active } = buildPlayerCards(
      input({
        earned: ["first_blood", "shut_the_box", "streak_3", "regular_25", "season_champion"].map(
          (key) => ({ player_id: "ada", achievement_key: key, times: 1 }),
        ),
      }),
      TODAY,
    );
    const ada = active.find((c) => c.player.id === "ada")!;
    expect(ada.badges.map((b) => b.emoji)).toEqual(["🏆", "🪑", "🔥"]);
    expect(ada.moreBadges).toBe(2);
    expect(ada.badgeCount).toBe(5);
    expect(active.find((c) => c.player.id === "ben")!.badges).toEqual([]);
  });

  it("counts titles, but not the month still being played", () => {
    const { active } = buildPlayerCards(
      input({
        monthlyChampions: [
          { month: "2026-08-01", player_id: "ada" },
          { month: "2026-09-01", player_id: "ada" },
          { month: "2026-10-01", player_id: "ada" },
        ],
        seasonChampions: [{ player_id: "ada" }],
      }),
      TODAY,
    );
    expect(active.find((c) => c.player.id === "ada")!.titles).toBe(3);
  });

  it("lists the last five finishes oldest first", () => {
    const form = [6, 5, 4, 3, 2, 1].map((n) => ({
      player_id: "ada",
      played_on: `2026-09-2${7 - n}`, // position 1 is the newest
      finish_position: n,
      participants: 6,
      is_winner: n === 1,
      is_shut_box: false,
    }));
    const { active } = buildPlayerCards(input({ form }), TODAY);
    const ada = active.find((c) => c.player.id === "ada")!;
    expect(ada.form.map((f) => f.position)).toEqual([5, 4, 3, 2, 1]);
    expect(ada.form.at(-1)!.won).toBe(true);
  });

  it("carries the streak and the fika count", () => {
    const streaks: PlayerStreakRow[] = [
      { player_id: "ada", name: "Ada", emoji: "🎲", best_streak: 4, current_streak: 2 } as PlayerStreakRow,
    ];
    const { active } = buildPlayerCards(
      input({ streaks, fika: new Map([["ada", 3]]) }),
      TODAY,
    );
    const ada = active.find((c) => c.player.id === "ada")!;
    expect(ada.streak).toBe(2);
    expect(ada.fika).toBe(3);
  });

  it("keeps benched players apart", () => {
    const { active, benched } = buildPlayerCards(
      input({
        roster: [player("ada", "Ada"), player("ben", "Ben", { is_active: false })],
      }),
      TODAY,
    );
    expect(active.map((c) => c.player.name)).toEqual(["Ada"]);
    expect(benched.map((c) => c.player.name)).toEqual(["Ben"]);
  });
});
