-- Phase 08-01: Study Plan FSRS 6 scheduler knobs.
--
-- The StudyPlan row gains three new fields used by FSRS 4.5+
-- scheduling. Phase 8 stores them via the deck Study Plan form
-- (5 fields total: newPerDay, reviewsPerDay, requestRetention,
-- enableFuzz, enableShortTerm) but does NOT yet pass them to the
-- live FSRS scheduler — buildQueue still only reads newPerDay +
-- reviewsPerDay for the daily cap. Phase 9+ threads them through
-- to the ts-fsrs FSRS instance.
--
-- Defaults rationale:
--   requestRetention = 0.9  — matches ts-fsrs 5.4.1
--     `default_request_retention` (its primary default for FSRS
--     4.5+). 0.9 is the recall probability the FSRS scheduler
--     targets when computing the next interval; 0.9 is what Anki
--     Desktop ships with for FSRS-4.5.
--   enableFuzz = true       — ts-fsrs 5.4.1's `default_enable_fuzz`
--     is `false` upstream, but we override to `true`. Without
--     fuzz, hundreds of cards at the same stability bucket land
--     on the same day and the daily queue spikes from 0 to 800.
--     Fuzz adds a small random jitter to spread the load.
--   enableShortTerm = true  — matches ts-fsrs 5.4.1
--     `default_enable_short_term`. When true, the 1m/10m
--     (re)learning step schedule is applied on first-pass and
--     after a lapse; without it, cards jump straight to a
--     calculated interval, which feels jarring.
--
-- All three columns are NOT NULL with a DB default so existing
-- StudyPlan rows from Phase 2/6/7 are backfilled automatically
-- and the migration is purely additive — no ALTER on the row
-- data, no risk of losing historical settings.

ALTER TABLE "StudyPlan" ADD COLUMN "requestRetention" REAL NOT NULL DEFAULT 0.9;

ALTER TABLE "StudyPlan" ADD COLUMN "enableFuzz" BOOLEAN NOT NULL DEFAULT 1;

ALTER TABLE "StudyPlan" ADD COLUMN "enableShortTerm" BOOLEAN NOT NULL DEFAULT 1;
