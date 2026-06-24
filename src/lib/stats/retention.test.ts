import { describe, it, expect } from "vitest";
import {
  retentionAt,
  sampleRetention,
  RETENTION_DAYS,
  adaptiveRetentionSpan,
  sampleEnsembleRetention,
  sampleMaintainedRetention,
} from "./retention";

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

describe("adaptiveRetentionSpan", () => {
  it("falls back to RETENTION_DAYS for null/invalid S", () => {
    expect(adaptiveRetentionSpan(null)).toBe(RETENTION_DAYS);
    expect(adaptiveRetentionSpan(0)).toBe(RETENTION_DAYS);
    expect(adaptiveRetentionSpan(-3)).toBe(RETENTION_DAYS);
    expect(adaptiveRetentionSpan(NaN)).toBe(RETENTION_DAYS);
  });

  it("scales to ~1.2 forgetting half-lives, clamped to [30, 365]", () => {
    expect(adaptiveRetentionSpan(1)).toBe(30); // 9*1*1.2=10.8 -> clamp up to 30
    expect(adaptiveRetentionSpan(10)).toBe(108); // round(9*10*1.2)
    expect(adaptiveRetentionSpan(1000)).toBe(365); // clamp down
  });
});

describe("sampleEnsembleRetention", () => {
  it("returns [] when no card has an established stability", () => {
    expect(sampleEnsembleRetention([])).toEqual([]);
    expect(sampleEnsembleRetention([0, -1, NaN])).toEqual([]);
  });

  it("averages the per-card retentions, not retention-at-mean (Jensen)", () => {
    const pts = sampleEnsembleRetention([1, 100], 9);
    const r1 = retentionAt(9, 1)!;
    const r2 = retentionAt(9, 100)!;
    expect(pts[9].retention).toBeCloseTo((r1 + r2) / 2, 10);
  });

  it("day 0 retention is 1 (all cards fully recalled)", () => {
    expect(sampleEnsembleRetention([5, 20, 50])[0]).toEqual({
      day: 0,
      retention: 1,
    });
  });

  it("ignores invalid stabilities mixed into the input", () => {
    expect(sampleEnsembleRetention([10, 0, NaN, -2], 5)).toEqual(
      sampleEnsembleRetention([10], 5)
    );
  });
});

describe("sampleMaintainedRetention", () => {
  it("returns [] for an invalid S0", () => {
    expect(sampleMaintainedRetention(0)).toEqual([]);
    expect(sampleMaintainedRetention(NaN)).toEqual([]);
  });

  it("starts at 1.0 and holds at/above the review target band", () => {
    const target = 0.9;
    const pts = sampleMaintainedRetention(5, 120, target);
    expect(pts[0]).toEqual({ day: 0, retention: 1 });
    for (const p of pts) {
      expect(p.retention).toBeGreaterThanOrEqual(target - 1e-9);
    }
  });

  it("stays well above the natural-forgetting curve at the horizon", () => {
    const span = 120;
    const maintained = sampleMaintainedRetention(5, span);
    const forgetting = sampleEnsembleRetention([5], span);
    expect(maintained[span].retention).toBeGreaterThan(
      forgetting[span].retention
    );
  });
});
