import "server-only";

/**
 * Phase 06-01 / Phase 8 (re-exec): FSRS answer scheduler.
 *
 * Owns the persistence side of "user rated card X with grade Y":
 *   1) verify ownership of the card (defense in depth),
 *   2) snapshot the current CardState into ReviewLog.previousState for undo,
 *   3) ask the SchedulingStrategy for the next state + progress + the
 *      in-session re-test signal (the algorithm lives in strategy.ts),
 *   4) upsert CardState + write Card.progress + insert ReviewLog in one
 *      $transaction so the audit trail, the live state, and the per-card
 *      progress can never drift apart.
 */
import { Prisma, type CardState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fsrsStrategy, RATING_FROM_API } from "./strategy";

// Re-exported so existing importers (`@/lib/fsrs`, tests) keep working.
export { RATING_FROM_API };

export interface AnswerResult {
  /** The freshly-persisted CardState row. */
  state: CardState;
  /** Phase 8 hybrid progress (0..1) just written to Card.progress. */
  progress: number;
  /** Did the card graduate to `review` on this answer? */
  graduated: boolean;
  /** Should the session re-test this card at a later random slot? */
  requeueInSession: boolean;
}

export async function answerCard(input: {
  cardId: string;
  rating: number;
  userId: string;
  now?: Date;
}): Promise<AnswerResult> {
  // Validate the rating up-front (before any DB work) so a bad rating
  // fails fast with the rating error rather than an ownership error.
  if (RATING_FROM_API[input.rating] === undefined) {
    throw new Error("rating 必须是 1..4");
  }

  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const card = await tx.card.findFirst({
      where: { id: input.cardId, deck: { userId: input.userId } },
      include: { cardState: true },
    });
    if (!card) throw new Error("卡片不存在或无权访问");

    // Snapshot the previous state for undo (lastReview / due as ISO
    // strings — the contract undo.ts rehydrates from).
    const previousState = card.cardState
      ? {
          stability: card.cardState.stability,
          difficulty: card.cardState.difficulty,
          elapsedDays: card.cardState.elapsedDays,
          scheduledDays: card.cardState.scheduledDays,
          learningSteps: card.cardState.learningSteps,
          reps: card.cardState.reps,
          lapses: card.cardState.lapses,
          state: card.cardState.state,
          lastReview: card.cardState.lastReview?.toISOString() ?? null,
          due: card.cardState.due?.toISOString() ?? null,
          // Phase 8 progress-v2: restored on undo so the high-water progress
          // and the day/fail gates can't drift after a revert.
          studyDays: card.cardState.studyDays,
          failCount: card.cardState.failCount,
          progress: card.progress,
        }
      : null;

    // The first-session threshold lives on the deck's StudyPlan (1.0 when
    // there is no plan = never early-graduate = re-test every still-learning
    // card this session).
    const plan = await tx.studyPlan.findUnique({
      where: { deckId: card.deckId },
      select: { firstSessionTargetProgress: true },
    });
    const threshold = plan?.firstSessionTargetProgress ?? 1.0;

    // The algorithm — swappable via the strategy.
    const decision = fsrsStrategy.schedule({
      state: card.cardState,
      rating: input.rating,
      now,
      threshold,
      userId: input.userId,
      prevProgress: card.progress,
    });

    const newState = await tx.cardState.upsert({
      where: { cardId: input.cardId },
      create: { cardId: input.cardId, ...decision.write },
      update: decision.write,
    });

    await tx.card.update({
      where: { id: input.cardId },
      data: { progress: decision.progress },
    });

    await tx.reviewLog.create({
      data: {
        cardId: input.cardId,
        deckId: card.deckId,
        userId: input.userId,
        rating: input.rating,
        previousState: previousState ?? Prisma.JsonNull,
      },
    });

    return {
      state: newState,
      progress: decision.progress,
      graduated: decision.graduated,
      requeueInSession: decision.requeueInSession,
    };
  });
}
