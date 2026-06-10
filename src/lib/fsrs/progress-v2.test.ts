import { describe, it, expect } from "vitest";
import {
  masteryFromStability,
  computeProgressV2,
  DAY1_CAP,
  MASTERY_S_FULL,
  type FsrsRating,
} from "./progress";

describe("masteryFromStability", () => {
  it("anchors at 0.80 for a freshly-graduated card (S=1)", () => {
    expect(masteryFromStability(1)).toBeCloseTo(0.8, 6);
  });

  it("returns 0 for non-positive / non-finite S (no stability = not learned)", () => {
    expect(masteryFromStability(0)).toBe(0);
    expect(masteryFromStability(-5)).toBe(0);
    expect(masteryFromStability(NaN)).toBe(0);
    expect(masteryFromStability(Infinity)).toBe(0);
  });

  it("reaches exactly 1.0 at the full-mastery stability and beyond", () => {
    expect(masteryFromStability(MASTERY_S_FULL)).toBe(1);
    expect(masteryFromStability(60)).toBe(1);
  });

  it("climbs slowly: ~0.89 at S=5, ~0.99 near S=21 (weeks to 100%)", () => {
    expect(masteryFromStability(5)).toBeCloseTo(0.891, 2);
    expect(masteryFromStability(21)).toBeCloseTo(0.99, 2);
  });

  it("is monotonically increasing in S", () => {
    let prev = -1;
    for (const S of [1, 2, 3, 5, 8, 13, 21, 29]) {
      const m = masteryFromStability(S);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });
});

const day1 = (rating: FsrsRating, prevProgress = 0, failCount = 0) =>
  computeProgressV2({ studyDays: 1, stability: 1, failCount, rating, prevProgress });
const day2 = (stability: number, failCount = 0, prevProgress = 0.8) =>
  computeProgressV2({ studyDays: 2, stability, failCount, rating: 3, prevProgress });

describe("computeProgressV2 — phase 1 (first day, capped 0.80)", () => {
  it("maps a fresh answer by rating (Again 0 / Hard .40 / Good .62 / Easy .80)", () => {
    expect(day1(1)).toBe(0); // Again on a brand-new card: nothing learned
    expect(day1(2)).toBeCloseTo(0.4, 6);
    expect(day1(3)).toBeCloseTo(0.62, 6);
    expect(day1(4)).toBeCloseTo(0.8, 6);
  });

  it("never exceeds the 0.80 day-1 cap, even with a spiked stability", () => {
    const easyHighS = computeProgressV2({
      studyDays: 1,
      stability: 100,
      failCount: 0,
      rating: 4,
      prevProgress: 0,
    });
    expect(easyHighS).toBeLessThanOrEqual(DAY1_CAP);
    expect(easyHighS).toBeCloseTo(0.8, 6);
  });

  it("is sticky: an Again does NOT zero a card that already has progress", () => {
    // prev 0.62, then Again (failCount now 1): keeps base 0.62, minus one penalty.
    expect(day1(1, 0.62, 1)).toBeCloseTo(0.55, 6);
  });

  it("floors the fail penalty at 40% of base — never reaches 0 once learned", () => {
    // prev 0.62, many fails: penalty would go negative, floored at 0.62*0.4.
    expect(day1(3, 0.62, 100)).toBeCloseTo(0.248, 6);
    expect(day1(3, 0.62, 100)).toBeGreaterThan(0);
  });

  it("high-water lifts a low card when a better rating arrives", () => {
    expect(day1(4, 0.4, 0)).toBeCloseTo(0.8, 6); // Easy over a prior 0.40 -> 0.80
  });
});

describe("computeProgressV2 — phase 2 (day 2+, stability mastery)", () => {
  it("starts at 0.80 (S=1) and can climb above the day-1 cap", () => {
    expect(day2(1)).toBeCloseTo(0.8, 6);
    expect(day2(10)).toBeGreaterThan(DAY1_CAP);
  });

  it("reaches 1.0 only once stability is high (weeks of review)", () => {
    expect(day2(MASTERY_S_FULL)).toBe(1);
    expect(day2(5)).toBeLessThan(1);
    expect(day2(5)).toBeCloseTo(0.891, 2);
  });

  it("applies a bounded review fail-penalty, floored at 40% of mastery", () => {
    expect(day2(5, 2)).toBeCloseTo(0.791, 2); // 0.891 - 2*0.05
    expect(day2(5, 100)).toBeCloseTo(0.356, 2); // floored at 0.891*0.4
    expect(day2(5, 100)).toBeGreaterThan(0);
  });

  it("a lapse (low S) lowers the score but not to 0", () => {
    const lapsed = computeProgressV2({
      studyDays: 3,
      stability: 0.5,
      failCount: 3,
      rating: 1,
      prevProgress: 0.9,
    });
    expect(lapsed).toBeLessThan(0.8);
    expect(lapsed).toBeGreaterThan(0);
  });
});

describe("computeProgressV2 — day gate (>= 2 days to exceed 80%, >= 2 days to 100%)", () => {
  it("studyDays<=1 is always capped at 0.80; studyDays>=2 can exceed it", () => {
    for (const r of [1, 2, 3, 4] as FsrsRating[]) {
      expect(
        computeProgressV2({ studyDays: 1, stability: 50, failCount: 0, rating: r, prevProgress: 0.79 })
      ).toBeLessThanOrEqual(DAY1_CAP);
    }
    expect(day2(50)).toBe(1); // day 2+, high S -> can reach 100%
  });
});
