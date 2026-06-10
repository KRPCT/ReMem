/**
 * Phase 08-04: first-session graduation status machine (D-09..D-12).
 *
 * A card is "in its first session" from the moment it enters the
 * `new` state until the moment it leaves `new` for any reason
 * (graduating to review, or, in the FSRS 6 model, a lapse that
 * never sends a card back to `new`).
 *
 * Graduation criterion: progress >= threshold (default 0.80) WHILE
 * the card is still in its first session. The threshold is sourced
 * from StudyPlan.firstSessionTargetProgress — see CONTEXT D-11.
 *
 * Graduation outcome: state transitions to `review` with
 *   - newStability = 1.0  (D-12 — fixed canonical seed for graduates)
 *   - newDifficulty preserved from current CardState (D-12)
 *
 * Out of scope here: the actual write. This module is a pure
 * decision helper. The caller (buildQueue for re-bucket purposes,
 * or answerCard in the future) applies the decision.
 *
 * D-09 — only triggers during first session (state must be `new`)
 * D-10 — first session ends the moment the card leaves `new`
 * D-11 — default threshold 0.80
 * D-12 — graduate: state=review, S=1.0, D preserved
 *
 * Not to be confused with `graduatedFromFresh` in queue.ts, which
 * is a different concept: a queue-time re-bucket that moves
 * already-progressed new cards from the fresh bucket to the
 * review bucket *before* cap. The two are complementary:
 *   - checkFirstSessionGraduation is a state-machine decision
 *   - graduatedFromFresh is a queue-time scheduling decision
 */
import type { Card, CardState } from "@prisma/client";
import type { FsrsStateName } from "./card-adapter";
import type { FsrsRating } from "./progress";

/** Canonical "you just graduated" outcome (D-12). */
export type GraduationDecision = {
  shouldGraduate: true;
  newState: "review";
  newStability: 1.0;
  newDifficulty: number | null;
};

export type NoGraduation =
  | { shouldGraduate: false; reason: "state-not-new" }
  | { shouldGraduate: false; reason: "below-threshold" }
  | { shouldGraduate: false; reason: "missing-state" };

/**
 * Should this card graduate from its first session right now?
 *
 * Pure function — no I/O, no DB. Caller passes the canonical
 * newState.state from the freshly-written CardState (NOT a
 * caller-supplied value), to avoid tampering.
 *
 * @param card   - Card row; only `progress` is consulted
 * @param state  - the card's current FSRS state (from CardState)
 * @param rating - the most recent rating (1..4) — accepted for API
 *                 symmetry with computeProgressForState, but not
 *                 consulted: graduation is purely a state-machine
 *                 check, not a rating-driven one
 * @param threshold - StudyPlan.firstSessionTargetProgress (default
 *                 1.0 = never trigger — preserves pre-08-04 behavior)
 */
export function checkFirstSessionGraduation(input: {
  card: Pick<Card, "progress">;
  state: CardState["state"] | null | undefined;
  rating?: FsrsRating;
  threshold: number;
}): GraduationDecision | NoGraduation {
  // D-09: only within first session. If the card has already left
  // `new` (via lapse → relearning or via graduation), this returns
  // a non-graduate decision regardless of progress.
  if (input.state == null) {
    return { shouldGraduate: false, reason: "missing-state" };
  }
  const currentStateName = input.state as FsrsStateName;
  if (currentStateName !== "new") {
    return { shouldGraduate: false, reason: "state-not-new" };
  }

  // Threshold gate (D-11). 1.0 = never trigger (back-compat default).
  // Defensive: NaN / negative threshold → never trigger.
  if (
    !Number.isFinite(input.threshold) ||
    input.threshold > 1 ||
    input.threshold < 0
  ) {
    return { shouldGraduate: false, reason: "below-threshold" };
  }
  if (input.card.progress < input.threshold) {
    return { shouldGraduate: false, reason: "below-threshold" };
  }

  // D-12: graduate. S=1.0, D preserved (caller looks up from
  // CardState if they need the canonical difficulty).
  return {
    shouldGraduate: true,
    newState: "review",
    newStability: 1.0,
    newDifficulty: null, // caller fills from CardState if desired
  };
}
