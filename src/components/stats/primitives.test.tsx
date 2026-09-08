import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarRow, Delta, Sparkline } from "./primitives";

describe("Delta", () => {
  // [concept: never colour-only] The red/green is a second channel. If these
  // glyphs ever disappear, the direction becomes invisible to anyone who
  // cannot distinguish the two colours.
  it("carries the direction as a glyph and a sign, not just a colour", () => {
    const { container } = render(<Delta value={9.6} />);
    expect(container.textContent).toContain("▲");
    expect(container.textContent).toContain("+9.6");
  });

  it("does the same for a loss", () => {
    const { container } = render(<Delta value={-27.4} />);
    expect(container.textContent).toContain("▼");
    expect(container.textContent).toContain("27.4");
  });

  it("says 'no change' rather than showing a bare dash", () => {
    render(<Delta value={0} />);
    expect(screen.getByText("no change")).toBeInTheDocument();
  });

  it("treats a missing value as no change", () => {
    render(<Delta value={null} />);
    expect(screen.getByText("no change")).toBeInTheDocument();
  });
});

describe("Sparkline", () => {
  const stroke = (c: HTMLElement) =>
    c.querySelector("polyline")?.getAttribute("stroke");

  it("is green when a rating climbs", () => {
    const { container } = render(
      <Sparkline values={[1000, 1020, 1049]} label="Alice's rating" />,
    );
    expect(stroke(container)).toBe("var(--color-shut)");
  });

  it("is red when a rating falls", () => {
    const { container } = render(
      <Sparkline values={[1049, 1020, 1000]} label="Alice's rating" />,
    );
    expect(stroke(container)).toBe("var(--color-danger)");
  });

  // The bug this exists to prevent: the same component draws average SCORES,
  // where falling is improving. It shipped colouring an improving player red,
  // directly above a caption saying a falling line meant they were improving.
  it("inverts the colour when down is the good direction", () => {
    const { container } = render(
      <Sparkline
        values={[18, 14, 11]}
        label="Dora's monthly average"
        goodDirection="down"
      />,
    );
    expect(stroke(container)).toBe("var(--color-shut)");
  });

  it("and marks a rising score as the wrong way", () => {
    const { container } = render(
      <Sparkline
        values={[10, 11, 13]}
        label="Alice's monthly average"
        goodDirection="down"
      />,
    );
    expect(stroke(container)).toBe("var(--color-danger)");
  });

  it("names the unit it plots, so the label cannot claim games are months", () => {
    render(
      <Sparkline
        values={[10, 11]}
        label="Alice's monthly average"
        unit="months"
      />,
    );
    expect(
      screen.getByLabelText(/over the last 2 months$/),
    ).toBeInTheDocument();
  });

  it("says so plainly when there is not enough to draw", () => {
    render(<Sparkline values={[1000]} label="Alice's rating" />);
    expect(screen.getByText("not enough games yet")).toBeInTheDocument();
  });

  it("survives a flat line without dividing by zero", () => {
    const { container } = render(
      <Sparkline values={[1000, 1000, 1000]} label="Alice's rating" />,
    );
    const points = container.querySelector("polyline")?.getAttribute("points");
    expect(points).not.toContain("NaN");
  });
});

describe("BarRow", () => {
  it("always shows the number, so the bar is decoration", () => {
    render(<BarRow value={4} max={7} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("does not divide by zero when nothing has happened yet", () => {
    const { container } = render(<BarRow value={0} max={0} />);
    const fill = container.querySelector(
      "span[aria-hidden] > span",
    ) as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });
});
