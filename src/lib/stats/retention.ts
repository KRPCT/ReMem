/**
 * Phase 09 (STATS-02): memory retention curve data layer.
 *
 * Re-implements the FSRS-6 forgetting curve  R(t) = (1 + t / (9·S))^-1.
 *
 * The canonical formula + defensive guards are the "review" branch of
 * `computeProgressForState` in src/lib/fsrs/progress.ts:115. That
 * function is per-card (requires state === "review" + elapsedDays); the
 * retention CURVE sweeps `t` at a fixed average stability `S`, so this
 * module mirrors the same math and guards as a standalone sampler
 * rather than calling `computeProgressForState` (09-RESEARCH.md § F1).
 * Keep the two in sync if the FSRS formula ever changes.
 *
 * Difference from progress.ts: an invalid / not-yet-established S
 * returns `null` (empty sentinel) instead of `0`, so the chart branches
 * to an empty state (D-06) rather than drawing a misleading flat line.
 */

export interface RetentionPoint {
  /** Days since last review. */
  day: number;
  /** Predicted retention, 0..1. */
  retention: number;
}

/** Default curve span in days. UI-SPEC samples t = 0..60 → 61 points. */
export const RETENTION_DAYS = 60;

/**
 * R(t) = (1 + t / (9·S))^-1 — FSRS-6 forgetting curve.
 *
 * Mirrors the guards in progress.ts:107-117. Returns `null` (empty
 * sentinel) when S is not yet established (≤ 0) or inputs are invalid,
 * so callers render an empty state instead of a degenerate curve.
 * At t = 0 → 1.0; at t = 9·S → 0.5; as t → ∞ → 0.
 */
export function retentionAt(t: number, S: number): number | null {
  if (!Number.isFinite(t) || !Number.isFinite(S)) return null;
  if (S <= 0) return null; // not yet established (D-04 / D-06)
  if (t < 0) return null;
  const raw = 1 / (1 + t / (9 * S));
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Sample the retention curve at t = 0..`days`. Returns an empty array
 * when S is invalid (≤ 0 / non-finite) so the caller renders the empty
 * state; otherwise yields exactly `days + 1` points (61 by default).
 */
export function sampleRetention(
  S: number,
  days: number = RETENTION_DAYS
): RetentionPoint[] {
  if (!Number.isFinite(S) || S <= 0) return [];
  const points: RetentionPoint[] = [];
  for (let day = 0; day <= days; day++) {
    const retention = retentionAt(day, S);
    if (retention === null) return []; // defensive — unreachable for valid S
    points.push({ day, retention });
  }
  return points;
}

/**
 * Adaptive x-axis span (days) for the two-curve retention chart. The old fixed
 * 0-60 window left mature decks hugging 100% (a visually dead near-flat line).
 * Scale the window to the forgetting half-life (9·S days) so the red curve
 * always drops meaningfully, bounded to [30, 365] days. Falls back to the
 * default span when stability is not yet established.
 */
export function adaptiveRetentionSpan(avgStability: number | null): number {
  if (
    avgStability == null ||
    !Number.isFinite(avgStability) ||
    avgStability <= 0
  ) {
    return RETENTION_DAYS;
  }
  return Math.max(30, Math.min(365, Math.round(9 * avgStability * 1.2)));
}

/**
 * RED baseline — population expected recall if reviewing stops now. For each
 * day t it AVERAGES retentionAt(t, S) across every card's own stability, i.e.
 * the expected fraction of the collection still recalled at t. This is the
 * statistically sound aggregate: a single curve drawn at the mean stability
 * misstates the collection (Jensen's inequality), whereas averaging the
 * per-card retentions does not. Returns [] when no card has an established
 * stability, so the caller renders the empty state.
 */
export function sampleEnsembleRetention(
  stabilities: number[],
  days: number = RETENTION_DAYS
): RetentionPoint[] {
  const valid = stabilities.filter((s) => Number.isFinite(s) && s > 0);
  if (valid.length === 0) return [];
  const points: RetentionPoint[] = [];
  for (let day = 0; day <= days; day++) {
    let sum = 0;
    for (const S of valid) sum += retentionAt(day, S) ?? 0;
    points.push({ day, retention: sum / valid.length });
  }
  return points;
}

/** At each on-schedule review the maintained-curve sim grows stability by this
 *  factor. Illustrative only — the live FSRS scheduler computes the real
 *  per-review stability; this constant just makes the sawtooth teeth widen
 *  believably as a card matures. */
export const REVIEW_STABILITY_GROWTH = 1.9;
/** Retention level that triggers a review in the maintained-curve sim. Matches
 *  the chart's reference line and the ts-fsrs default request retention. */
export const REVIEW_TARGET_RETENTION = 0.9;

/**
 * GREEN overlay — the illustrative "if you keep reviewing on schedule" curve.
 * Simulates one representative card (starting stability S0): retention decays
 * via retentionAt until it reaches REVIEW_TARGET_RETENTION, then a review snaps
 * it back to 1.0 and grows stability by REVIEW_STABILITY_GROWTH, so the teeth
 * widen as the card matures and the curve holds high. A teaching overlay that
 * contrasts with the red natural-forgetting curve — it is NOT the live
 * scheduler. Returns [] for an invalid S0.
 */
export function sampleMaintainedRetention(
  S0: number,
  days: number = RETENTION_DAYS,
  target: number = REVIEW_TARGET_RETENTION
): RetentionPoint[] {
  if (!Number.isFinite(S0) || S0 <= 0) return [];
  const points: RetentionPoint[] = [];
  let S = S0;
  let lastReviewDay = 0;
  for (let day = 0; day <= days; day++) {
    let retention = retentionAt(day - lastReviewDay, S) ?? 0;
    if (day > lastReviewDay && retention < target) {
      S *= REVIEW_STABILITY_GROWTH;
      lastReviewDay = day;
      retention = 1;
    }
    points.push({ day, retention });
  }
  return points;
}
