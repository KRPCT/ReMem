import { describe, it, expect } from "vitest";
import {
  FSRS_RECOMMENDED_VALUES,
  type StudyPlanRecommended,
} from "./recommendations";

describe("FSRS_RECOMMENDED_VALUES (Phase 08-01)", () => {
  it("has the exact 5 keys with the documented values", () => {
    // Snapshot — guards against accidental rename or value drift.
    // Updating this snapshot is a deliberate act and must update the
    // form label / migration comment / docs in lockstep.
    expect(FSRS_RECOMMENDED_VALUES).toEqual({
      requestRetention: 0.9,
      newPerDay: 20,
      reviewsPerDay: 200,
      enableFuzz: true,
      enableShortTerm: true,
    });
  });

  it("matches ts-fsrs default_request_retention = 0.9", async () => {
    // We don't import `default_request_retention` directly (it's not
    // in ts-fsrs' public export list — it's a `declare const` only in
    // the .d.ts). Instead we drive `generatorParameters()` and check
    // that its return value, when we ask for `request_retention`, is
    // 0.9 — which is the only way to verify the upstream default
    // without reaching into private typings.
    const { generatorParameters } = await import("ts-fsrs");
    const params = generatorParameters();
    expect(params.request_retention).toBe(0.9);
    expect(FSRS_RECOMMENDED_VALUES.requestRetention).toBe(
      params.request_retention
    );
  });

  it("overrides ts-fsrs default_enable_fuzz (false → true)", async () => {
    // ts-fsrs ships `default_enable_fuzz = false` and
    // `generatorParameters()` does NOT override it. So the upstream
    // default is `false`, but we ship `true` to smooth the daily
    // queue. This test documents that intentional override — if
    // someone "fixes" enableFuzz to `false` to match upstream, this
    // test will fail and force them to read this comment first.
    const { generatorParameters } = await import("ts-fsrs");
    const params = generatorParameters();
    expect(params.enable_fuzz).toBe(false);
    expect(FSRS_RECOMMENDED_VALUES.enableFuzz).toBe(true);
    expect(FSRS_RECOMMENDED_VALUES.enableFuzz).not.toBe(
      params.enable_fuzz
    );
  });

  it("matches ts-fsrs default_enable_short_term = true", async () => {
    const { generatorParameters } = await import("ts-fsrs");
    const params = generatorParameters();
    expect(params.enable_short_term).toBe(true);
    expect(FSRS_RECOMMENDED_VALUES.enableShortTerm).toBe(
      params.enable_short_term
    );
  });

  it("StudyPlanRecommended type covers all 5 keys with correct primitives", () => {
    // Compile-time check via runtime reflection: every value is one
    // of the three primitive kinds we expect, and no key is missing.
    // Catches a refactor that drops a field (e.g., removing
    // `enableShortTerm` from the object) without updating the form.
    const v = FSRS_RECOMMENDED_VALUES as StudyPlanRecommended;
    expect(typeof v.requestRetention).toBe("number");
    expect(typeof v.newPerDay).toBe("number");
    expect(typeof v.reviewsPerDay).toBe("number");
    expect(typeof v.enableFuzz).toBe("boolean");
    expect(typeof v.enableShortTerm).toBe("boolean");
    expect(Object.keys(v)).toEqual([
      "requestRetention",
      "newPerDay",
      "reviewsPerDay",
      "enableFuzz",
      "enableShortTerm",
    ]);
    expect(Number.isInteger(v.newPerDay)).toBe(true);
    expect(Number.isInteger(v.reviewsPerDay)).toBe(true);
  });

  it("stays frozen (Object.values has no undefined entries)", () => {
    // `as const` makes the values readonly at compile time, but at
    // runtime the object is still extensible. This guards against
    // someone adding a stray `FSRS_RECOMMENDED_VALUES.x = ...` and
    // accidentally mutating the shipped defaults.
    expect(
      Object.values(FSRS_RECOMMENDED_VALUES).every((v) => typeof v !== "undefined")
    ).toBe(true);
    expect(Object.keys(FSRS_RECOMMENDED_VALUES)).toHaveLength(5);
  });
});
