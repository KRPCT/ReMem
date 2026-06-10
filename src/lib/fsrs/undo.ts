import "server-only";

/**
 * Phase 06-01: revert the most recent review for a card.
 *
 * Reads the latest ReviewLog with `undoneAt IS NULL`, restores the
 * card's CardState from the log's `previousState` snapshot (or
 * deletes the CardState row entirely if the snapshot is null —
 * meaning the very first review of a brand-new card), then stamps
 * `undoneAt = now()` on the log so it can never be undone again.
 *
 * Idempotent: a second call returns `{ restored: false, reason:
 * "no-history" }` because the prior call already marked the only
 * eligible log.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Zod schema for the `previousState` JSONB column on ReviewLog.
 *
 * Defined here (not in `src/lib/validation.ts`) because it's an
 * internal audit-trail contract — callers should never write to this
 * field directly. The shape mirrors the 9 CardState columns we
 * snapshot in `answerCard()` (lines 102-111 of scheduler.ts), with
 * `lastReview` / `due` as ISO-8601 strings (the form Prisma
 * serializes for the JSONB column).
 *
 * Review: WR-01 — replaces the previous structural `as` cast that
 * would have silently propagated NaN / Invalid Date into the next
 * `answerCard()` call if the JSON was ever corrupted.
 */
const previousStateSchema = z.object({
  stability: z.number().finite(),
  difficulty: z.number().finite(),
  elapsedDays: z.number().int().nonnegative(),
  scheduledDays: z.number().int().nonnegative(),
  // Phase 08 fix: persisted learning step. `.optional()` keeps undo
  // working for ReviewLog rows written before this column existed
  // (they have no learningSteps key) — those restore to step 0.
  learningSteps: z.number().int().nonnegative().optional(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  // Phase 8 progress-v2: optional — undo logs written before v2 lack these,
  // and restore to a safe default (0) in that case.
  studyDays: z.number().int().nonnegative().optional(),
  failCount: z.number().int().nonnegative().optional(),
  progress: z.number().finite().optional(),
  state: z.enum(["new", "learning", "review", "relearning"]),
  lastReview: z.string().nullable(),
  due: z.string().nullable(),
});

export async function revertLastAnswer(input: {
  cardId: string;
  userId: string;
}): Promise<{ restored: boolean; cardId: string; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    // Defense in depth: verify the card still belongs to the user.
    const card = await tx.card.findFirst({
      where: { id: input.cardId, deck: { userId: input.userId } },
      select: { id: true, cardState: { select: { id: true } } },
    });
    if (!card) throw new Error("卡片不存在或无权访问");

    // Find the latest non-undone log for this card.
    const log = await tx.reviewLog.findFirst({
      where: { cardId: input.cardId, undoneAt: null },
      orderBy: { reviewedAt: "desc" },
    });
    if (!log) {
      return {
        restored: false,
        cardId: input.cardId,
        reason: "no-history",
      };
    }

    // Runtime-validate the snapshot before reading. A corrupted log
    // row (e.g. partial write, manual edit, or a future bug in
    // answerCard's snapshot step) would otherwise propagate NaN /
    // Invalid Date into the next answerCard() call and corrupt
    // scheduling silently.
    let prev: z.infer<typeof previousStateSchema> | null = null;
    if (log.previousState !== null) {
      const parsed = previousStateSchema.safeParse(log.previousState);
      if (!parsed.success) {
        return {
          restored: false,
          cardId: input.cardId,
          reason: "corrupt-history",
        };
      }
      prev = parsed.data;
    }

    if (prev === null) {
      // First review of a brand-new card: there was no prior
      // CardState. Restoring means removing whatever CardState
      // answerCard() created.
      if (card.cardState) {
        await tx.cardState.deleteMany({
          where: { cardId: input.cardId },
        });
      }
      // Phase 8 progress-v2: a brand-new card's progress was 0 before its
      // first answer — restore that so undo fully reverses the write.
      await tx.card.update({
        where: { id: input.cardId },
        data: { progress: 0 },
      });
    } else {
      // prev is fully typed here (Zod-validated above); no `as` casts needed.
      const writePayload = {
        stability: prev.stability,
        difficulty: prev.difficulty,
        elapsedDays: prev.elapsedDays,
        scheduledDays: prev.scheduledDays,
        // Phase 08 fix: restore the persisted step (0 for legacy logs).
        learningSteps: prev.learningSteps ?? 0,
        reps: prev.reps,
        lapses: prev.lapses,
        // Phase 8 progress-v2 trackers (0 for pre-v2 legacy logs).
        studyDays: prev.studyDays ?? 0,
        failCount: prev.failCount ?? 0,
        state: prev.state,
        lastReview: prev.lastReview ? new Date(prev.lastReview) : null,
        due: prev.due ? new Date(prev.due) : null,
      };
      await tx.cardState.upsert({
        where: { cardId: input.cardId },
        create: { cardId: input.cardId, userId: input.userId, ...writePayload },
        update: writePayload,
      });
      // Phase 8 progress-v2: restore the card's high-water progress (legacy
      // logs without it fall back to 0).
      await tx.card.update({
        where: { id: input.cardId },
        data: { progress: prev.progress ?? 0 },
      });
    }

    // Soft-delete the log: preserves the audit trail for STATS-01
    // while excluding this review from any future "latest non-undone"
    // lookup.
    await tx.reviewLog.update({
      where: { id: log.id },
      data: { undoneAt: new Date() },
    });

    return { restored: true, cardId: input.cardId };
  });
}
