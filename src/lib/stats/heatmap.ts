/**
 * Phase 09 (STATS-01): review heatmap data layer.
 *
 * Aggregates ReviewLog rows into a 365-day GitHub-style contribution
 * grid. Two exports:
 *   - bucketReviewsByDay  — PURE; the unit-test surface.
 *   - getReviewHeatmap    — thin Prisma wrapper (multi-tenant scoped).
 *
 * Day bucketing is done in JS using LOCAL date getters (not SQL
 * `date()` / `groupBy`) so the "study day" boundary follows the
 * user's local timezone and stays deterministically testable without
 * a database (09-RESEARCH.md § STATS-01).
 */
import { prisma } from "@/lib/prisma";

export interface HeatmapDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Non-undone reviews on that day. */
  count: number;
}

/** Past-365-days window (≈ 53 weeks × 7), inclusive of today. */
export const HEATMAP_WINDOW_DAYS = 365;

/** Format a Date to a local-day key `YYYY-MM-DD` (local getters, not UTC). */
function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of the given date (drops the time component). */
function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Pure: bucket review timestamps into `HEATMAP_WINDOW_DAYS` local-day
 * counts ending at `windowEndLocalDay` (inclusive). Days with no
 * reviews are present with `count: 0`. Output is oldest→newest and
 * always exactly `HEATMAP_WINDOW_DAYS` entries. Timestamps outside the
 * window are ignored.
 */
export function bucketReviewsByDay(
  timestamps: Date[],
  windowEndLocalDay: Date
): HeatmapDay[] {
  const end = localMidnight(windowEndLocalDay);

  // Ordered day keys (oldest first) + reverse index for O(1) lookup.
  const keys: string[] = [];
  const index = new Map<string, number>();
  for (let i = HEATMAP_WINDOW_DAYS - 1; i >= 0; i--) {
    const day = new Date(end);
    day.setDate(end.getDate() - i);
    const key = localDayKey(day);
    index.set(key, keys.length);
    keys.push(key);
  }

  const counts = new Array<number>(keys.length).fill(0);
  for (const ts of timestamps) {
    const idx = index.get(localDayKey(ts));
    if (idx !== undefined) counts[idx] += 1; // out-of-window timestamps dropped
  }

  return keys.map((date, i) => ({ date, count: counts[i] }));
}

/**
 * Fetch the user's non-undone reviews from the last 365 days and bucket
 * them by local day.
 *
 * Multi-tenant: `userId` is always in the `where` clause. `undoneAt: null`
 * excludes reverted reviews (D-02). The `reviewedAt` range is served by
 * `@@index([userId, reviewedAt])`.
 */
export async function getReviewHeatmap(
  userId: string,
  now: Date = new Date()
): Promise<HeatmapDay[]> {
  const cutoff = localMidnight(now);
  cutoff.setDate(cutoff.getDate() - (HEATMAP_WINDOW_DAYS - 1));

  const rows = await prisma.reviewLog.findMany({
    where: { userId, undoneAt: null, reviewedAt: { gte: cutoff } },
    select: { reviewedAt: true },
  });

  return bucketReviewsByDay(
    rows.map((r) => r.reviewedAt),
    now
  );
}
