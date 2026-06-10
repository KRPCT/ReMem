/**
 * Phase 06-01: CardState (Prisma) <-> ts-fsrs Card (Date) adapter.
 *
 * ts-fsrs@5.4.1 uses native `Date` (not dayjs) for `due` and
 * `last_review`, and numbers for stability / difficulty. Prisma's
 * `CardState` mirrors those types as `DateTime?` and `Float?`. This
 * module is the one boundary that translates between the two.
 *
 * Phase 08 fix: `learning_steps` IS now persisted (CardState.learningSteps).
 * v1 hard-coded it to 0 on load and dropped it on write, which broke
 * multi-step learning graduation — a card re-entered step 0 every
 * answer and never advanced to `review`. The adapter now round-trips
 * it so ts-fsrs can graduate cards normally.
 */
import { createEmptyCard, State, type Card as FsrsCard } from "ts-fsrs";
import type { CardState } from "@prisma/client";

export type FsrsStateName = "new" | "learning" | "review" | "relearning";

export const STATE_NUM_TO_NAME: Record<number, FsrsStateName> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

export const STATE_NAME_TO_NUM: Record<FsrsStateName, number> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/**
 * Build a ts-fsrs Card from a Prisma CardState row, or an empty
 * card if the row does not exist yet (brand-new card, never
 * reviewed).
 */
export function toFsrsCard(state: CardState | null, now: Date): FsrsCard {
  if (state === null) return createEmptyCard(now);
  return {
    due: state.due ?? now,
    stability: state.stability ?? 0,
    difficulty: state.difficulty ?? 0,
    elapsed_days: state.elapsedDays ?? 0,
    scheduled_days: state.scheduledDays ?? 0,
    // Phase 08 fix: round-trip the persisted step so ts-fsrs resumes
    // the card on the correct learning/relearning step instead of
    // restarting at 0 (which blocked graduation).
    learning_steps: state.learningSteps ?? 0,
    reps: state.reps,
    lapses: state.lapses,
    state: STATE_NAME_TO_NUM[state.state as FsrsStateName],
    last_review: state.lastReview ?? undefined,
  };
}

/**
 * Build a Prisma CardState write payload from a ts-fsrs Card.
 *
 * T-SHOT: 故意丢弃 card.learning_steps (v1 不持久化).
 */
export function fromFsrsCard(
  card: FsrsCard,
  userId: string
): {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: FsrsStateName;
  lastReview: Date | null;
  due: Date;
  userId: string;
} {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    // Phase 08 fix: persist the step ts-fsrs advanced the card to, so
    // the next answer resumes from it (the key to graduation).
    learningSteps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NUM_TO_NAME[card.state],
    lastReview: card.last_review ?? null,
    due: card.due,
    userId,
  };
}
