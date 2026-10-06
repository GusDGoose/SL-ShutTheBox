import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodayDone } from "./today-done";

const MARINA = { player_id: "m", name: "Marina", emoji: "🦩" };
const LINDA = { player_id: "l", name: "Linda", emoji: "🐢" };

describe("TodayDone", () => {
  it("says today's game is done and offers no new one", () => {
    render(<TodayDone gameId="g1" winners={[LINDA]} score={27} />);
    expect(
      screen.getByRole("heading", { name: /today's game is done/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Linda/)).toBeInTheDocument();
    expect(screen.getByText(/won the day with/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /roll the dice/i })).not.toBeInTheDocument();
  });

  it("links to the game, which is where a mistake is corrected", () => {
    render(<TodayDone gameId="g1" winners={[LINDA]} score={27} />);
    expect(screen.getByRole("link", { name: /see today's game/i })).toHaveAttribute(
      "href",
      "/game/g1",
    );
  });

  it("names everyone who shared the day, and a shut box for what it is", () => {
    render(<TodayDone gameId="g1" winners={[MARINA, LINDA]} score={0} />);
    expect(screen.getByText(/Marina/)).toBeInTheDocument();
    expect(screen.getByText(/shared the day with/i)).toBeInTheDocument();
    expect(screen.getByText(/📦 0/)).toBeInTheDocument();
  });
});
