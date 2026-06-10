/**
 * Phase 06-01: public surface of the fsrs lib.
 *
 * The HTTP route handlers and Server Actions should import from
 * "@/lib/fsrs" (this module), not from the individual sub-modules.
 * This keeps the dependency surface explicit — if we later want to
 * move or rename a sub-module, only this file changes.
 */
export { STUDY_PLAN_DEFAULTS } from "./defaults";
export { toFsrsCard, fromFsrsCard } from "./card-adapter";
export type { FsrsStateName } from "./card-adapter";
export { buildQueue } from "./queue";
export type { QueueResult, QueueItem } from "./queue";
export { answerCard, RATING_FROM_API } from "./scheduler";
export type { AnswerResult } from "./scheduler";
// Phase 8 (re-exec): the algorithm behind a strategy. Swap `fsrsStrategy`
// to change scheduling without touching the persistence layer.
export { fsrsStrategy } from "./strategy";
export type {
  SchedulingStrategy,
  ScheduleInput,
  ScheduleResult,
} from "./strategy";
export { revertLastAnswer } from "./undo";
// Phase 08-01: FSRS-recommended Study Plan values (used by the
// "FSRS 推荐" button on the deck Study Plan form).
export { FSRS_RECOMMENDED_VALUES } from "./recommendations";
export type { StudyPlanRecommended } from "./recommendations";
// Phase 08-04: first-session graduation status machine (D-09..D-12).
// Pure decision helper — caller applies the decision. Used by buildQueue's
// re-bucket path indirectly via StudyPlan.firstSessionTargetProgress.
export { checkFirstSessionGraduation } from "./graduation";
export type { GraduationDecision, NoGraduation } from "./graduation";
