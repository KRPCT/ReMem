-- Phase 08 fix: persist FSRS `learning_steps`.
--
-- ts-fsrs uses `learning_steps` to track which learning/relearning
-- step a card currently sits on. The v1 adapter hard-coded this to 0
-- on every load (card-adapter.ts toFsrsCard) and dropped it on every
-- write (fromFsrsCard), so a card in multi-step learning kept
-- restarting at step 0 and could NEVER graduate to `review`. It
-- oscillated in `learning` indefinitely (the user's "次次过完 /
-- 算法无法生效" report).
--
-- Persisting the column lets ts-fsrs advance a card through its
-- learning steps and graduate it (e.g. New + Good + Good → Review).
--
-- Additive, NOT NULL DEFAULT 0 — existing rows keep step 0, which is
-- the correct starting point for any card already in learning.

ALTER TABLE "CardState" ADD COLUMN "learningSteps" INTEGER NOT NULL DEFAULT 0;
