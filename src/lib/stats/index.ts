/**
 * Phase 09: public surface of the stats lib.
 *
 * Server Component pages should import from "@/lib/stats" (this module),
 * not from the individual sub-modules — mirrors the `@/lib/fsrs` barrel.
 */
export { bucketReviewsByDay, getReviewHeatmap, HEATMAP_WINDOW_DAYS } from "./heatmap";
export type { HeatmapDay } from "./heatmap";
export {
  retentionAt,
  sampleRetention,
  adaptiveRetentionSpan,
  sampleEnsembleRetention,
  sampleMaintainedRetention,
  REVIEW_STABILITY_GROWTH,
  REVIEW_TARGET_RETENTION,
  RETENTION_DAYS,
} from "./retention";
export type { RetentionPoint } from "./retention";
export { bucketCardStates } from "./distribution";
export type { CardStateDistribution, CardWithStateLike } from "./distribution";
