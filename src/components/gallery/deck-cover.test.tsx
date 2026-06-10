import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DeckCover } from "./deck-cover";

describe("DeckCover", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a small accent swatch using the provided color", () => {
    const { container } = render(
      <DeckCover accent="var(--type-accent-qa)" />
    );
    const swatch = container.querySelector("span");
    expect(swatch).not.toBeNull();
    const inlineStyle = (swatch as HTMLElement).style.backgroundColor;
    expect(inlineStyle).toContain("var(--type-accent-qa)");
  });

  it("accepts a `hsl(...)` wrapped value as the accent", () => {
    const { container } = render(
      <DeckCover accent="hsl(162 50% 58%)" />
    );
    const swatch = container.querySelector("span");
    // jsdom normalizes hsl() values to rgb() so we just check
    // that a non-empty background color was applied.
    const inlineStyle = (swatch as HTMLElement).style.backgroundColor;
    expect(inlineStyle).not.toBe("");
    expect(inlineStyle).toMatch(/^rgb/);
  });
});
