/**
 * Phase 08-01: FSRS-recommended Study Plan values.
 *
 * The "FSRS 推荐" button on the deck Study Plan form fills all 5
 * fields with these constants. Each value is sourced from either
 * ts-fsrs 5.4.1 defaults or the Anki Desktop conventions:
 *
 * - `requestRetention` — ts-fsrs `default_request_retention = 0.9`.
 *   The recall probability the FSRS scheduler targets when computing
 *   the next interval. Lower → more aggressive (more frequent reviews);
 *   higher → lazier. 0.9 is the upstream default and what Anki
 *   ships with FSRS-4.5+.
 * - `newPerDay` / `reviewsPerDay` — Anki Desktop defaults
 *   (20 new cards, 200 reviews). Reasonable starting throughput
 *   for an adult learner reviewing 30 minutes/day.
 * - `enableFuzz` — ts-fsrs `default_enable_fuzz = false` upstream,
 *   but we **override to true** for this project. Without fuzz, the
 *   scheduler emits identical intervals for cards at the same
 *   stability bucket, so hundreds of cards land on the same day and
 *   produce spiky "0 today / 800 tomorrow" queues. Fuzz adds a
 *   small random jitter (±5%) to spread the load. Desktop users
 *   who study on a tighter cadence benefit from this smoothing.
 * - `enableShortTerm` — ts-fsrs `default_enable_short_term = true`.
 *   When true, the (re)learning step schedule (1m / 10m default)
 *   is applied on first-pass and after a lapse. When false, cards
 *   jump straight to a calculated interval, which produces a
 *   jarring "see once, then wait 4 days" experience.
 *
 * Phase 8 only persists these and surfaces them in the form; the
 * scheduler still reads `newPerDay` / `reviewsPerDay` from the
 * StudyPlan row (it doesn't yet take requestRetention / enableFuzz
 * / enableShortTerm as live FSRSParameters). Phase 9+ will thread
 * the latter three into `buildQueue` and `answerCard`.
 */
export const FSRS_RECOMMENDED_VALUES = {
  requestRetention: 0.9,
  newPerDay: 20,
  reviewsPerDay: 200,
  enableFuzz: true,
  enableShortTerm: true,
} as const;

export type StudyPlanRecommended = typeof FSRS_RECOMMENDED_VALUES;
