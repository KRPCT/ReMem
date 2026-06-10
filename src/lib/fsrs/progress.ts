/**
 * Phase 8 (re-exec, 2026-06-09): per-card learning progress (0..1 float),
 * algorithm v2.
 *
 * `Card.progress` is a "how learned is this card" bar (0 = brand new,
 * 1 = mastered). v2 replaces the old single-answer step table + R(t) decay
 * with a two-phase model:
 *
 *   - Phase 1 (first calendar day, `studyDays <= 1`): rating-driven and
 *     hard-capped at 0.80. Sticky against the card's current progress
 *     (high-water), so an Again never zeroes accumulated success — only a
 *     bounded, floored fail penalty applies. Stability is ignored here, so an
 *     Easy new card whose ts-fsrs stability spikes still tops out at 0.80.
 *   - Phase 2 (`studyDays >= 2`): stability-driven mastery climbing
 *     0.80 -> 1.0 over weeks of successful review; a lapse lowers stability
 *     and the score (floored, never to 0 for an established card).
 *
 * Net effect (the user's spec): day-1 max 80%, >= 2 days to exceed it,
 * 100% only after long-term review, reviews BUILD progress (not decay it),
 * and failures discount but never erase a learned card.
 *
 * Pure module — no I/O, no DB. The scheduling strategy (strategy.ts) composes
 * these with ts-fsrs; callers must hold the canonical post-answer values.
 */

/** FSRS state names — matches Prisma CardState.state enum + adapter. */
export type FsrsStateName = "new" | "learning" | "review" | "relearning";

/** Rating 1=Again, 2=Hard, 3=Good, 4=Easy. Matches studyAnswerSchema. */
export type FsrsRating = 1 | 2 | 3 | 4;

/** Hard ceiling for the first calendar day (day-1 max = 0.80). */
export const DAY1_CAP = 0.8;
/** Rating -> first-day base score (then capped at DAY1_CAP). Again = 0. */
const DAY1_STEP: Record<FsrsRating, number> = { 1: 0, 2: 0.4, 3: 0.62, 4: 0.8 };
/** Per-fail penalty subtracted from the base, day-1 vs review phase. */
const FAIL_PENALTY_DAY1 = 0.07;
const FAIL_PENALTY_REVIEW = 0.05;
/** A penalty floors at this fraction of the base (never below 40% of base). */
const PENALTY_FLOOR_FRAC = 0.4;
/** Mastery curve anchors: mastery(1) = 0.80, climbing toward 1.0. */
const MASTERY_BASE = 0.8;
const MASTERY_SPAN = 0.2;
const MASTERY_S_REF = 1;
const MASTERY_HALFLIFE = 4.6; // S half-life of the remaining 0.20 gap
/** Stability (days) at which a card is treated as fully mastered (= 1.0). */
export const MASTERY_S_FULL = 30;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Long-term mastery from FSRS stability S (days).
 *   mastery(1) = 0.80, mastery(~21) ≈ 0.99, mastery(>= 30) = 1.0.
 * Returns 0 for non-finite / non-positive S (no stability = not learned).
 */
export function masteryFromStability(S: number): number {
  if (!Number.isFinite(S) || S <= 0) return 0;
  if (S >= MASTERY_S_FULL) return 1;
  const m =
    MASTERY_BASE +
    MASTERY_SPAN * (1 - Math.pow(2, -(S - MASTERY_S_REF) / MASTERY_HALFLIFE));
  return clamp01(m);
}

/** Input to the v2 progress computation (values are POST-answer). */
export interface ProgressV2Input {
  /** Distinct calendar days studied after this answer (>= 1). */
  studyDays: number;
  /** FSRS stability (days) after this answer. */
  stability: number;
  /** Cumulative Again count after this answer. */
  failCount: number;
  /** UI rating 1..4 for this answer. */
  rating: FsrsRating;
  /** The card's progress BEFORE this answer (high-water anchor, 0..1). */
  prevProgress: number;
}

/**
 * Two-phase learning progress (0..1). Pure. See the module header.
 *
 * Phase 1 never inspects stability — the first day is rating-driven and
 * capped — so a graduation seed (S=1.0) or an Easy stability spike does not
 * change a day-1 score.
 */
export function computeProgressV2(input: ProgressV2Input): number {
  const prev = Number.isFinite(input.prevProgress)
    ? clamp01(input.prevProgress)
    : 0;
  const fails =
    Number.isFinite(input.failCount) && input.failCount > 0
      ? Math.floor(input.failCount)
      : 0;

  // Phase 1 — first calendar day: rating-driven, sticky, hard-capped 0.80.
  if (!Number.isFinite(input.studyDays) || input.studyDays <= 1) {
    const step =
      input.rating >= 1 && input.rating <= 4 ? DAY1_STEP[input.rating] : 0;
    // High-water: an Again (step 0) keeps the prior progress, so one slip
    // never zeroes accumulated success — only the fail penalty bites.
    const base = Math.max(prev, step);
    if (base <= 0) return 0; // brand-new card, no success yet
    const penalized = base - FAIL_PENALTY_DAY1 * fails;
    const floored = Math.max(base * PENALTY_FLOOR_FRAC, penalized);
    return Math.min(DAY1_CAP, Math.max(0, floored));
  }

  // Phase 2 — day 2+: stability mastery, rises toward 1.0 or falls on a lapse.
  const m = masteryFromStability(input.stability);
  if (m <= 0) return 0;
  const penalized = m - FAIL_PENALTY_REVIEW * fails;
  const floored = Math.max(m * PENALTY_FLOOR_FRAC, penalized);
  return clamp01(floored);
}
