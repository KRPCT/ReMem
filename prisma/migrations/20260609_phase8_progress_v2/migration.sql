-- Phase 8 progress-v2 (2026-06-09): two-phase learning-progress algorithm.
-- Adds the two tracking columns the new progress formula needs:
--   studyDays — distinct calendar days the card has been studied. Gates the
--               day-1 cap (<=1 = first day, hard-capped at 0.80; >=2 unlocks
--               the stability-mastery climb toward 1.0).
--   failCount — cumulative Again presses; discounts accumulated success in the
--               progress formula (bounded, floored — never zeroes a learned card).
ALTER TABLE "CardState" ADD COLUMN "studyDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CardState" ADD COLUMN "failCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing cards so already-established (review/relearning) cards are
-- NOT mis-gated to "day 1" the first time they are answered under the new
-- algorithm (which would wrongly cap them at 0.80). failCount seeds from the
-- FSRS lapse count as the best available proxy for past failures.
UPDATE "CardState" SET "studyDays" = CASE
  WHEN "state" IN ('review', 'relearning') THEN 2
  WHEN "reps" > 0 THEN 1
  ELSE 0
END;
UPDATE "CardState" SET "failCount" = "lapses";
