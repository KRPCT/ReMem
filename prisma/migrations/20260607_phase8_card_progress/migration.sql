-- Phase 08-02: per-card FSRS 6 learning progress.
--
-- The Card table gains a single REAL column `progress` in [0, 1].
-- Phase 8 reads/writes it from src/lib/fsrs/progress.ts's
-- `computeFsrs6Progress` on every answerCard. The deck-level mean
-- is exposed by /decks/[id] (added in Phase 08-03) and per-card
-- progress is shown on /decks/[id]/cards/[cardId].
--
-- The @@index([deckId, progress]) added in the schema supports the
-- deck-mean aggregate ("mean(progress) where deckId = X AND
-- suspended = false"). Without the index, the mean lookup becomes
-- a full table scan once a deck has thousands of cards.
--
-- Initial value 0 for ALL existing rows (NOT NULL, no DB default
-- variation). New cards start at 0 until their first review.
-- Purely additive — no risk to existing card data.

ALTER TABLE "Card" ADD COLUMN "progress" REAL NOT NULL DEFAULT 0;

CREATE INDEX "Card_deckId_progress_idx" ON "Card"("deckId", "progress");
