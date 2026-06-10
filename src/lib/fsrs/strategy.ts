/**
 * Phase 8 (re-exec): the scheduling algorithm, extracted behind a
 * STRATEGY interface.
 *
 * `answerCard` (scheduler.ts) delegates the "given a card's state + a rating,
 * what's the next state, the progress, and should we re-test it this session?"
 * decision to a `SchedulingStrategy`. The default `fsrsStrategy` wraps ts-fsrs
 * + the v2 two-phase progress (progress.ts) + first-session graduation.
 * Swapping the algorithm (a different SRS, an A/B variant, a test stub) is a
 * one-line change of the strategy.
 *
 * Pure module — no DB, no `server-only`. The card-adapter is the
 * Prisma↔ts-fsrs boundary; `studyDays` / `failCount` are this app's own
 * progress-tracking fields (not ts-fsrs concepts), computed here and merged
 * into the persisted write.
 */
import { fsrs, Rating, type Grade } from "ts-fsrs";
import type { CardState } from "@prisma/client";
import { fromFsrsCard, toFsrsCard, type FsrsStateName } from "./card-adapter";
import { computeProgressV2, type FsrsRating } from "./progress";
import { checkFirstSessionGraduation } from "./graduation";

/**
 * Map a 1-indexed UI rating (1=Again … 4=Easy) to the ts-fsrs `Grade`.
 * `Rating.Manual = 0` is excluded from `Grade`, so any key outside
 * {1,2,3,4} yields `undefined` and the strategy throws.
 */
export const RATING_FROM_API: Record<number, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

/** True when two dates fall on the same LOCAL calendar day. */
function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface ScheduleInput {
  /** Current persisted state (pre-answer); null for a brand-new card. */
  state: CardState | null;
  /** UI rating 1..4. */
  rating: number;
  now: Date;
  /**
   * StudyPlan.firstSessionTargetProgress. 1.0 = never early-graduate AND
   * (because day-1 progress is always <= 0.80) means any still-learning card
   * is re-tested this session.
   */
  threshold: number;
  userId: string;
  /**
   * The card's `Card.progress` BEFORE this answer. The v2 first-day formula
   * uses it as a high-water anchor so a single Again never zeroes a card that
   * has already learned something.
   */
  prevProgress: number;
}

export interface ScheduleResult {
  /** Fields to persist to CardState, incl. the v2 studyDays / failCount. */
  write: ReturnType<typeof fromFsrsCard> & {
    studyDays: number;
    failCount: number;
  };
  /** v2 progress (0..1) for the freshly-written state. */
  progress: number;
  /** Did the card enter `review` on this answer (graduated)? */
  graduated: boolean;
  /**
   * Should the session re-test this card later? True when the card did NOT
   * graduate and its progress is still below the threshold.
   */
  requeueInSession: boolean;
}

export interface SchedulingStrategy {
  readonly name: string;
  schedule(input: ScheduleInput): ScheduleResult;
}

/**
 * Default strategy: FSRS 6 (ts-fsrs) + v2 two-phase progress +
 * first-session graduation. The `relearning_steps` 1→2 deviation (D-08)
 * lives here as the only allowed tweak.
 */
export const fsrsStrategy: SchedulingStrategy = {
  name: "fsrs-6-progress-v2",
  schedule({
    state,
    rating,
    now,
    threshold,
    userId,
    prevProgress,
  }: ScheduleInput): ScheduleResult {
    const grade = RATING_FROM_API[rating];
    if (grade === undefined) throw new Error("rating 必须是 1..4");

    // D-08: two relearning steps (ts-fsrs default is one: ["10m"]).
    const f = fsrs({ relearning_steps: ["10m", "20m"] });
    const next = f.next(toFsrsCard(state, now), now, grade);

    // v2 tracking. studyDays counts DISTINCT calendar days (gates the day-1
    // cap): a fresh card or a review whose previous answer was an earlier day
    // bumps it; same-day in-session re-tests do not. failCount is the
    // cumulative Again count that discounts the progress score.
    const prevLastReview = state?.lastReview ?? null;
    const isNewDay =
      prevLastReview === null || !sameLocalDay(prevLastReview, now);
    const studyDays = (state?.studyDays ?? 0) + (isNewDay ? 1 : 0);
    const failCount = (state?.failCount ?? 0) + (rating === 1 ? 1 : 0);

    const write = {
      ...fromFsrsCard(next.card, userId),
      studyDays,
      failCount,
    };

    // v2 progress. Phase 1 (day 1) ignores stability and caps at 0.80, so the
    // graduation seed (S=1.0) below cannot change a day-1 score — we compute
    // once and reuse it.
    const progress = computeProgressV2({
      studyDays,
      stability: write.stability,
      failCount,
      rating: rating as FsrsRating,
      prevProgress,
    });

    // First-session graduation (accelerator-only, D-09..D-12): a still-new card
    // that reached the threshold this session is fast-tracked to `review`.
    // Never overrides a card ts-fsrs already graduated or sent to relearning.
    const preState = (state?.state ?? "new") as FsrsStateName;
    const graduation = checkFirstSessionGraduation({
      card: { progress },
      state: preState,
      threshold,
    });
    if (graduation.shouldGraduate && write.state === "learning") {
      write.state = "review";
      write.stability = graduation.newStability; // 1.0 (D-12)
      write.learningSteps = 0;
      write.scheduledDays = 1;
      write.due = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      // progress is unchanged: graduation happens on the first day
      // (studyDays <= 1), where computeProgressV2 is rating-driven and ignores
      // the now-changed state/stability.
    }

    const graduated = write.state === "review";
    // Re-test in-session when the card hasn't graduated and its progress is
    // still below the first-session threshold. A graduated (review) card is
    // done for the session — its FSRS due date schedules the next look.
    const requeueInSession = !graduated && progress < threshold;

    return { write, progress, graduated, requeueInSession };
  },
};
