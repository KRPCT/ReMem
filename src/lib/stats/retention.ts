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
