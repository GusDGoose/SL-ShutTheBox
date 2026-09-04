import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board } from "./board";
import type { Ruleset } from "@/lib/rules";

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

const NINE: Ruleset = { ...VANILLA, tiles: 9 };

describe("Board", () => {
  it("renders twelve tiles for a twelve-tile ruleset", () => {
    render(<Board rules={VANILLA} down={new Set()} onToggle={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(12);
  });

  it("renders nine for a nine-tile ruleset", () => {
    render(<Board rules={NINE} down={new Set()} onToggle={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("reports which tiles are down to a screen reader", () => {
    render(<Board rules={NINE} down={new Set([3])} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /tile 3 down/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /tile 4 up/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls back with the tapped tile", async () => {
    const onToggle = vi.fn();
    render(<Board rules={NINE} down={new Set()} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: /tile 7 up/i }));
    expect(onToggle).toHaveBeenCalledWith(7);
  });

  // A spectator sees the same board but must not be able to tab into controls
  // they are not allowed to use.
  it("renders no controls at all without onToggle", () => {
    render(<Board rules={NINE} down={new Set([1, 2])} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("img", { name: /7 of 9 tiles still up/i })).toBeInTheDocument();
  });

  it("marks the tray as shut when every tile is down", () => {
    const { container } = render(
      <Board rules={NINE} down={new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])} onToggle={() => {}} />,
    );
    expect(container.querySelector(".tray")).toHaveAttribute("data-shut", "true");
  });

  it("does not mark the tray shut while a tile is still up", () => {
    const { container } = render(
      <Board rules={NINE} down={new Set([1, 2, 3, 4, 5, 6, 7, 8])} onToggle={() => {}} />,
    );
    expect(container.querySelector(".tray")).not.toHaveAttribute("data-shut");
  });

  it("flags a golden tile so it is obvious it is worth more", () => {
    const golden: Ruleset = {
      ...NINE,
      modifiers: [{ kind: "golden_tile", tile: 7, multiplier: 2 }],
    };
    render(<Board rules={golden} down={new Set()} onToggle={() => {}} />);
    expect(
      screen.getByRole("button", { name: /tile 7 up, golden/i }),
    ).toHaveAttribute("data-golden", "true");
  });

  describe("keyboard", () => {
    it("toggles a tile by typing its number", async () => {
      const onToggle = vi.fn();
      render(<Board rules={NINE} down={new Set()} onToggle={onToggle} />);
      await userEvent.click(screen.getByRole("button", { name: /tile 1 up/i }));
      onToggle.mockClear();
      await userEvent.keyboard("5");
      expect(onToggle).toHaveBeenCalledWith(5);
    });

    // Two digits in quick succession mean tile 12, not tile 1 then tile 2.
    it("reads two quick digits as one two-digit tile", async () => {
      const onToggle = vi.fn();
      render(<Board rules={VANILLA} down={new Set()} onToggle={onToggle} />);
      await userEvent.click(screen.getByRole("button", { name: /tile 1 up/i }));
      onToggle.mockClear();
      await userEvent.keyboard("12");
      expect(onToggle).toHaveBeenLastCalledWith(12);
    });

    it("ignores a number the board does not have", async () => {
      const onToggle = vi.fn();
      render(<Board rules={NINE} down={new Set()} onToggle={onToggle} />);
      await userEvent.click(screen.getByRole("button", { name: /tile 1 up/i }));
      onToggle.mockClear();
      await userEvent.keyboard("0");
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("moves focus along the row with the arrow keys", async () => {
      render(<Board rules={NINE} down={new Set()} onToggle={() => {}} />);
      const first = screen.getByRole("button", { name: /tile 1 up/i });
      first.focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(screen.getByRole("button", { name: /tile 2 up/i })).toHaveFocus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(first).toHaveFocus();
    });
  });
});
