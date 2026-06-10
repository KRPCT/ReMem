-- Phase 06-01: ReviewLog undo support.
--
-- previousState (JSONB): snapshot of the 9 CardState fields
--   (stability / difficulty / elapsedDays / scheduledDays / reps /
--   lapses / state / lastReview / due) captured at the moment of this
--   review. revertLastAnswer() reads it back to restore the card to
--   its pre-review state. null on the very first review of a brand-new
--   card, where there is no prior CardState to snapshot.
--
-- undoneAt (DATETIME): soft-delete marker. null = the log is live and
--   counts toward review history. non-null = the log was undone at
--   this time. We keep the row (rather than DELETE) so STATS-01 can
--   still audit the full review trail including undos.
--
-- Composite index (cardId, undoneAt): the hot path is
--   `findFirst({ where: { cardId, undoneAt: null }, orderBy: { reviewedAt: "desc" } })`
--   in revertLastAnswer(). Without the index, this becomes a full
--   table scan once a user has thousands of reviews.

ALTER TABLE "ReviewLog" ADD COLUMN "previousState" JSONB;

ALTER TABLE "ReviewLog" ADD COLUMN "undoneAt" DATETIME;

CREATE INDEX "ReviewLog_cardId_undoneAt_idx" ON "ReviewLog"("cardId", "undoneAt");
