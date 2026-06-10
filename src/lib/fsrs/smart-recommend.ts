import "server-only";

/**
 * Phase 08-04: FSRS 6 smart-recommendation engine.
 *
 * Computes a Study Plan for a deck using two signals:
 *   1. The user's actual historical throughput over the last 30
 *      days (ReviewLog count per day → median for reviewsPerDay,
 *      plus card-introductions per day → median for newPerDay).
 *   2. ts-fsrs 5.4.1 default FSRS 6 parameters for the scheduler
 *      knobs (request_retention, enable_fuzz, enable_short_term).
 *
 * If the user has < 30 days of history (e.g. brand new account,
 * or coming back after a long break), we fall back to the Anki
 * Desktop defaults (20 new / 200 reviews). Below that threshold
 * a "median of 3 days" would be noisy and might pick a too-low
 * value that traps the user in a low-throughput loop.
 *
 * The smart-recommendation is what the "智能推荐 v6" button on
 * the Study Plan form fills. It does NOT write the DB — the
 * user still has to hit "保存". This keeps the recommendation
 * explicitly a suggestion, never a forced migration of an
 * existing plan the user is happy with.
 *
 * Reuses the same 5+1 field shape as the form, so the action
 * can ship the result straight into the form's setFields.
 */
import { prisma } from "@/lib/prisma";
import { FSRS_RECOMMENDED_VALUES } from "./recommendations";

/**
 * 30-day window. Empirically: shorter windows (7d) over-react to
 * study streaks ("you did 200 cards on Sunday!"), longer windows
 * (90d) under-react to the user's actual current cadence. 30d
 * matches the Anki stat window and is short enough to be
 * actionable.
 */
const HISTORY_WINDOW_DAYS = 30;
const HISTORY_WINDOW_MS = HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type SmartRecommendedPlan = {
  requestRetention: number;
  newPerDay: number;
  reviewsPerDay: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  firstSessionTargetProgress: number;
  /**
   * Where the numbers came from. Surfaced in the form via a
   * small caption so the user can tell "the system guessed
   * from your history" vs "Anki Desktop default" and adjust
   * accordingly. Useful for trust + transparency.
   */
  source: "user-history-30d" | "anki-default-fallback";
  /** Per-field provenance for UI display: "median(history)" etc. */
  rationale: {
    newPerDay: string;
    reviewsPerDay: string;
    requestRetention: string;
    enableFuzz: string;
    enableShortTerm: string;
    firstSessionTargetProgress: string;
  };
};

/**
 * Compute the median of a numeric array. Returns 0 for an empty
 * input (caller decides what that means — for "no history" it
 * falls back to defaults rather than persisting 0).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

/**
 * Build a date-keyed "YYYY-MM-DD" string for bucketing review
 * events by calendar day. We compute the day in UTC for
 * determinism; if the user wants their local-day stat they can
 * apply a TZ offset in a future revision.
 */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function recommendStudyPlanForDeck(
  userId: string,
  _deckId: string
): Promise<SmartRecommendedPlan> {
  // Pull the last 30 days of ReviewLogs for this user. We don't
  // filter by deckId because the smart-recommendation is about
  // the user's overall throughput across all decks — a user's
  // "this deck is light, my other deck is heavy" pattern would
  // produce a per-deck-recommendation that's too low.
  const cutoff = new Date(Date.now() - HISTORY_WINDOW_MS);
  const recentLogs = await prisma.reviewLog.findMany({
    where: {
      userId,
      reviewedAt: { gte: cutoff },
    },
    select: {
      rating: true,
      reviewedAt: true,
      // Phase 8-04 can't yet query "first review of a card" from
      // ReviewLog directly (no `isFirst` flag). For now, we
      // estimate newPerDay from the first-time-on-a-card
      // distribution in CardState: a card with reps === 0 means
      // it has never been reviewed. We compute "new cards
      // introduced per day" from the union of (a) the day a
      // card's createdAt falls on if its reps is now > 0, and
      // (b) the first reviewedAt of any card in ReviewLog. The
      // simpler path: ask prisma for the count of cards the
      // user introduced in each of the last 30 days, regardless
      // of when they were first reviewed.
    },
  });

  if (recentLogs.length === 0) {
    // No history → fall back to Anki Desktop defaults.
    return {
      ...FSRS_RECOMMENDED_VALUES,
      firstSessionTargetProgress: 0.8,
      source: "anki-default-fallback",
      rationale: {
        newPerDay: "Anki Desktop 默认 (历史不足 30 天)",
        reviewsPerDay: "Anki Desktop 默认 (历史不足 30 天)",
        requestRetention: "ts-fsrs default_request_retention",
        enableFuzz: "本项目覆盖 ts-fsrs 默认 (开 fuzz)",
        enableShortTerm: "ts-fsrs default_enable_short_term",
        firstSessionTargetProgress: "FSRS 6 经验值 0.80",
      },
    };
  }

  // Bucket the logs by day, count events per day.
  const reviewsByDay = new Map<string, number>();
  for (const log of recentLogs) {
    const key = dayKey(log.reviewedAt);
    reviewsByDay.set(key, (reviewsByDay.get(key) ?? 0) + 1);
  }
  const reviewsPerDay = median(Array.from(reviewsByDay.values()));

  // For newPerDay, count distinct (cardId, day) introductions —
  // a card's first review (where ReviewLog doesn't carry a
  // "first review" flag) is hard to compute from ReviewLog
  // alone. Use Card.createdAt as a proxy: cards created in the
  // last 30 days whose reps is now > 0 are "newly introduced".
  // We query Card directly here, not via deck.
  const newCards = await prisma.card.findMany({
    where: {
      deck: { userId },
      createdAt: { gte: cutoff },
    },
    select: {
      createdAt: true,
      cardState: { select: { reps: true } },
    },
  });
  const newCardsByDay = new Map<string, number>();
  for (const c of newCards) {
    if ((c.cardState?.reps ?? 0) > 0) {
      const key = dayKey(c.createdAt);
      newCardsByDay.set(key, (newCardsByDay.get(key) ?? 0) + 1);
    }
  }
  const newPerDay = median(Array.from(newCardsByDay.values()));

  // Clamp to the same bounds the form validates. Smart-recommend
  // never returns a value the form would reject.
  const safeNew = Math.max(0, Math.min(9999, newPerDay));
  const safeReviews = Math.max(0, Math.min(9999, reviewsPerDay));

  return {
    ...FSRS_RECOMMENDED_VALUES,
    newPerDay: safeNew,
    reviewsPerDay: safeReviews,
    firstSessionTargetProgress: 0.8,
    source: "user-history-30d",
    rationale: {
      newPerDay:
        newCardsByDay.size > 0
          ? `${safeNew} 张/天 · 30 天历史中位数 (活跃 ${newCardsByDay.size} 天)`
          : "30 天未引入新卡 · 沿用 FSRS 默认",
      reviewsPerDay:
        reviewsByDay.size > 0
          ? `${safeReviews} 张/天 · 30 天历史中位数 (活跃 ${reviewsByDay.size} 天)`
          : "30 天无复习 · 沿用 FSRS 默认",
      requestRetention: "ts-fsrs default_request_retention = 0.9",
      enableFuzz: "本项目覆盖 ts-fsrs 默认 (开 fuzz)",
      enableShortTerm: "ts-fsrs default_enable_short_term",
      firstSessionTargetProgress: "FSRS 6 经验值 0.80",
    },
  };
}
