import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CardType } from "@/lib/validation";
import { TypeFilterPills } from "./type-filter-pills";

const TYPES: readonly CardType[] = ["qa", "choice", "multi_choice", "fill", "judge"];
const COUNTS: Record<CardType, number> = {
  qa: 3,
  choice: 0,
  multi_choice: 1,
  fill: 5,
  judge: 0,
};

describe("TypeFilterPills", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one pill per type with the count", () => {
    render(
      <TypeFilterPills
        types={TYPES}
        active={new Set()}
        counts={COUNTS}
        onToggle={() => {}}
      />
    );
    for (const t of TYPES) {
      expect(screen.getByText(`${t} (${COUNTS[t]})`)).toBeDefined();
    }
  });

  it("applies the brand-tinted active class when the type is in the active set", () => {
    const { container } = render(
      <TypeFilterPills
        types={TYPES}
        active={new Set<CardType>(["qa"])}
        counts={COUNTS}
        onToggle={() => {}}
      />
    );
    const activePill = container.querySelector('button[aria-pressed="true"]');
    expect(activePill).not.toBeNull();
    expect(activePill?.className).toContain("border-brand");
    expect(activePill?.className).toContain("bg-brand");
  });

  it("calls onToggle with the clicked type", () => {
    const onToggle = vi.fn();
    render(
      <TypeFilterPills
        types={TYPES}
        active={new Set()}
        counts={COUNTS}
        onToggle={onToggle}
      />
    );
    const pill = screen.getByText("fill (5)");
    fireEvent.click(pill);
    expect(onToggle).toHaveBeenCalledWith("fill");
  });
});
