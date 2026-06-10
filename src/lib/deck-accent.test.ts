import { describe, it, expect } from "vitest";
import { getDeckAccent, getDeckAccentLabel, DECK_ACCENT_PALETTE } from "./deck-accent";

describe("getDeckAccent", () => {
  it("returns the same color for the same deck id", () => {
    expect(getDeckAccent("deck-123")).toBe(getDeckAccent("deck-123"));
  });

  it("falls back to palette[0] for an empty id", () => {
    expect(getDeckAccent("")).toBe(DECK_ACCENT_PALETTE[0].hsl);
  });

  it("returns a value from the palette for any non-empty id", () => {
    const ids = ["a", "b", "c", "longer-deck-id", "卡片-1", "x".repeat(40)];
    for (const id of ids) {
      const accent = getDeckAccent(id);
      expect(DECK_ACCENT_PALETTE.find((p) => p.hsl === accent)).toBeDefined();
    }
  });

  it("spreads distinct ids across multiple palette entries", () => {
    const colors = new Set<string>();
    for (let i = 0; i < 20; i++) {
      colors.add(getDeckAccent(`deck-${i}`));
    }
    // With 20 ids and 8 palette entries, expect at least 3 distinct
    // values (the hash is cheap so some collisions are expected;
    // the assertion is "not all the same" rather than "8 distinct").
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });
});

describe("getDeckAccentLabel", () => {
  it("returns a human-readable label", () => {
    expect(getDeckAccentLabel("deck-123")).toMatch(/[a-z]+/);
  });

  it("returns the same label for the same id", () => {
    expect(getDeckAccentLabel("deck-123")).toBe(getDeckAccentLabel("deck-123"));
  });
});
