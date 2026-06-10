import { describe, it, expect, vi } from "vitest";

// Stub the server-action import so we can import the pure helper
// without dragging next-auth / prisma / next/cache into the
// jsdom test bundle. The "use server" file's chain
// (next-auth + prisma + next/cache) is exercised in actions.test.ts
// — this file only cares about the pure buildSessionStats helper.
vi.mock("./actions", () => ({
  answerCardAction: vi.fn(),
  undoCardAction: vi.fn(),
  toggleFavoriteStudyAction: vi.fn(),
}));

import { buildSessionStats, requeuePosition } from "./study-session";

describe("requeuePosition (in-session re-test placement)", () => {
  it("re-inserts at least MIN_GAP cards ahead — never immediate", () => {
    // rand=0 → smallest gap (2): a card at index 0 reappears at slot 3
    // (two cards after the next), so the user always sees other cards
    // before re-testing it.
    expect(requeuePosition(0, 20, () => 0)).toBe(3);
    expect(requeuePosition(5, 20, () => 0)).toBe(8);
  });

  it("caps the gap so the card isn't pushed too far away", () => {
    // rand→~1 → largest gap (6), bounded at index+1+6.
    expect(requeuePosition(0, 20, () => 0.999)).toBe(7);
  });

  it("clamps to the queue end when it's too short to honor the gap", () => {
    // 2-card queue: can't place 3 ahead, so it lands at the back (the
    // only remaining option).
    expect(requeuePosition(0, 2, () => 0)).toBe(2);
    expect(requeuePosition(1, 2, () => 0.999)).toBe(2);
  });

  it("is a pure function of (index, length, rand)", () => {
    // gap = 2 + floor(0.5 * 5) = 4 → index+1+4.
    expect(requeuePosition(3, 20, () => 0.5)).toBe(8);
  });
});

describe("buildSessionStats", () => {
  it("renders the zero session (all counters at 0) without crashing", () => {
    // Edge case: user opens the study page but every card is already
    // withdrawn (or the queue is short). The copy should not say NaN
    // and should still distinguish the two lines.
    expect(
      buildSessionStats({ reviewed: 0, correctCount: 0, wrongCount: 0 })
    ).toEqual({
      totalLine: "本次共复习 0 张卡片",
      statsLine: "答对 0 · 答错 0",
    });
  });

  it("renders a 7/3 split with all 10 cards reviewed", () => {
    // Happy path: typical session where the user got most cards right.
    // The reviewed total equals correct + wrong (10 = 7 + 3) so the
    // stats add up to the same number as the total line.
    expect(
      buildSessionStats({ reviewed: 10, correctCount: 7, wrongCount: 3 })
    ).toEqual({
      totalLine: "本次共复习 10 张卡片",
      statsLine: "答对 7 · 答错 3",
    });
  });

  it("renders a perfect session (5/0) without padding the wrong side", () => {
    // Best case: zero wrong, all correct. The stats line should
    // still emit a "0" for the wrong count instead of dropping the
    // segment — keeps the visual rhythm constant.
    expect(
      buildSessionStats({ reviewed: 5, correctCount: 5, wrongCount: 0 })
    ).toEqual({
      totalLine: "本次共复习 5 张卡片",
      statsLine: "答对 5 · 答错 0",
    });
  });

  it("renders a fully-wrong session (0/5) with the correct counter at zero", () => {
    // Worst case: every card wrong. Symmetry check with the
    // perfect-session test — neither side is elided.
    expect(
      buildSessionStats({ reviewed: 5, correctCount: 0, wrongCount: 5 })
    ).toEqual({
      totalLine: "本次共复习 5 张卡片",
      statsLine: "答对 0 · 答错 5",
    });
  });
});
