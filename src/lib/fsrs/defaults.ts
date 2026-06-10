/**
 * Phase 06-01: study plan fallback constants.
 *
 * Used by the queue builder when a deck has no StudyPlan row yet
 * (Phase 2 seeded a plan for new decks, but historical decks from
 * earlier phases may not have one). Phase 8 will surface these
 * fields on the StudyPlan settings form, replacing the fallback
 * with the user-edited values.
 */
export const STUDY_PLAN_DEFAULTS = {
  newPerDay: 20,
  reviewsPerDay: 200,
} as const;

// Phase 8 会通过 prisma.studyPlan 表读取真实值
