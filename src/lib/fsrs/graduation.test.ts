import { describe, it, expect } from "vitest";
import { checkFirstSessionGraduation } from "./graduation";
import type { Card } from "@prisma/client";

function mkCard(progress: number): Pick<Card, "progress"> {
  return { progress };
}

describe("checkFirstSessionGraduation (Phase 08-04 D-09..D-12)", () => {
  it("D-09/D-10: state=review → not in first session → no graduate", () => {
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.95),
      state: "review",
      threshold: 0.8,
    });
    expect(decision).toEqual({ shouldGraduate: false, reason: "state-not-new" });
  });

  it("D-09: state=learning → not in first session → no graduate", () => {
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.95),
      state: "learning",
      threshold: 0.8,
    });
    expect(decision.shouldGraduate).toBe(false);
    if (!decision.shouldGraduate) {
      expect(decision.reason).toBe("state-not-new");
    }
  });

  it("D-09: state=relearning → not in first session → no graduate", () => {
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.95),
      state: "relearning",
      threshold: 0.8,
    });
    expect(decision.shouldGraduate).toBe(false);
  });

  it("D-09: null state → missing-state reason", () => {
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.95),
      state: null,
      threshold: 0.8,
    });
    expect(decision).toEqual({ shouldGraduate: false, reason: "missing-state" });
  });

  it("D-11: state=new, progress=0.80, threshold=0.80 → graduate (boundary inclusive)", () => {
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.8),
      state: "new",
      threshold: 0.8,
    });
    expect(decision.shouldGraduate).toBe(true);
    if (decision.shouldGraduate) {
      // D-12: state=review, S=1.0
      expect(decision.newState).toBe("review");
      expect(decision.newStability).toBe(1.0);
    }
  });

  it("progress=0.79 < threshold=0.80 → no graduate (strict less-than)", () => {
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.79),
      state: "new",
      threshold: 0.8,
    });
    expect(decision).toEqual({ shouldGraduate: false, reason: "below-threshold" });
  });

  it("D-11: default threshold 1.0 → never graduate (back-compat with pre-08-04)", () => {
    // progress=0.99 < 1.0 → below-threshold
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.99),
      state: "new",
      threshold: 1.0,
    });
    expect(decision).toEqual({ shouldGraduate: false, reason: "below-threshold" });

    // progress=1.0 == 1.0 → graduate (boundary)
    const decision2 = checkFirstSessionGraduation({
      card: mkCard(1.0),
      state: "new",
      threshold: 1.0,
    });
    expect(decision2.shouldGraduate).toBe(true);
  });

  it("defensive: NaN / Infinity / out-of-range threshold → no graduate", () => {
    const cases: Array<number> = [NaN, Infinity, -Infinity, 1.5, -0.1];
    for (const threshold of cases) {
      const decision = checkFirstSessionGraduation({
        card: mkCard(0.95),
        state: "new",
        threshold,
      });
      expect(decision.shouldGraduate).toBe(false);
    }
  });

  it("D-12: graduate decision includes newStability=1.0 and newState=review", () => {
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.95),
      state: "new",
      threshold: 0.8,
    });
    expect(decision.shouldGraduate).toBe(true);
    if (decision.shouldGraduate) {
      expect(decision.newStability).toBe(1.0);
      expect(decision.newState).toBe("review");
    }
  });

  it("rating argument is accepted but does not influence the decision", () => {
    // D-09..D-12: graduation is a state-machine check, not a rating check.
    // The rating param is in the API for symmetry with computeProgressForState
    // but is not consulted.
    const decisionGood = checkFirstSessionGraduation({
      card: mkCard(0.9),
      state: "new",
      rating: 3,
      threshold: 0.8,
    });
    const decisionAgain = checkFirstSessionGraduation({
      card: mkCard(0.9),
      state: "new",
      rating: 1,
      threshold: 0.8,
    });
    expect(decisionGood.shouldGraduate).toBe(true);
    expect(decisionAgain.shouldGraduate).toBe(true);
  });

  it("re-entering new state from outside (defensive): state=new + high progress still graduates", () => {
    // In FSRS 6, lapses route a review card to `relearning`, not back to `new`.
    // This is a defensive test: if a future refactor ever sends a card back to
    // `new`, our graduation check still applies (it can't tell the difference).
    const decision = checkFirstSessionGraduation({
      card: mkCard(0.95),
      state: "new",
      threshold: 0.8,
    });
    expect(decision.shouldGraduate).toBe(true);
  });
});
