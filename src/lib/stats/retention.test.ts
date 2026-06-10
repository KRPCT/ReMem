import { describe, it, expect } from "vitest";
import { retentionAt, sampleRetention, RETENTION_DAYS } from "./retention";

describe("retentionAt", () => {
  it("R(0) = 1.0 for any positive S", () => {
    expect(retentionAt(0, 1)).toBe(1);
    expect(retentionAt(0, 50)).toBe(1);
  });

  it("R(9S) = 0.5 (canonical forgetting-curve midpoint)", () => {
    expect(retentionAt(9, 1)).toBeCloseTo(0.5, 10); // 9 = 9·1
    expect(retentionAt(90, 10)).toBeCloseTo(0.5, 10); // 90 = 9·10
  });

  it("R(18S) = 1/3", () => {
    expect(retentionAt(18, 1)).toBeCloseTo(1 / 3, 10);
  });

  it("is monotonically decreasing in t", () => {
    let prev = Infinity;
    for (const t of [0, 1, 5, 10, 30, 60]) {
      const r = retentionAt(t, 10)!;
      expect(r).toBeLessThan(prev);
      prev = r;
    }
  });

  it("S <= 0 → null (empty sentinel, not NaN)", () => {
    expect(retentionAt(5, 0)).toBeNull();
    expect(retentionAt(5, -10)).toBeNull();
  });

  it("non-finite t or S → null", () => {
    expect(retentionAt(NaN, 10)).toBeNull();
    expect(retentionAt(5, Infinity)).toBeNull();
    expect(retentionAt(Infinity, 10)).toBeNull();
  });

  it("negative t → null", () => {
    expect(retentionAt(-1, 10)).toBeNull();
  });

  it("result is clamped to [0, 1]", () => {
    for (const t of [0, 1, 100, 10000]) {
      const r = retentionAt(t, 5)!;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe("sampleRetention", () => {
  it("returns days+1 points (61 by default) for valid S", () => {
    expect(sampleRetention(10)).toHaveLength(RETENTION_DAYS + 1);
    expect(sampleRetention(10)).toHaveLength(61);
  });

  it("first point is t=0 retention=1; last point is t=60", () => {
    const pts = sampleRetention(10);
    expect(pts[0]).toEqual({ day: 0, retention: 1 });
    expect(pts[60].day).toBe(60);
  });

  it("S = 0 or invalid → empty array (caller renders empty state)", () => {
    expect(sampleRetention(0)).toEqual([]);
    expect(sampleRetention(-5)).toEqual([]);
    expect(sampleRetention(NaN)).toEqual([]);
  });

  it("respects a custom day span", () => {
    expect(sampleRetention(10, 30)).toHaveLength(31);
  });
});
