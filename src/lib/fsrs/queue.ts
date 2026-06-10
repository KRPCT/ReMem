/**
 * Phase 06-01 / 08-04: study queue builder (pure function).
 *
 * Buckets cards into new / learning / review, applies daily caps,
 * and returns the ordered study session plus the uncapped available
 * counts so the UI can show "X of Y left today" stats.
 *
 * Bucket order in the final queue: learning first (must graduate),
 * review second (most overdue), new last (FIFO by createdAt).
 *
 * Cap policy: learning has NO cap (the user must see all due
 * learning cards to graduate them within the session — they have
 * sub-day due times and are time-sensitive). review and new are
 * capped by StudyPlan.reviewsPerDay / newPerDay.
 *
 * Phase 08-04 — first-session target progress re-bucket:
 * A card with state="new" AND Card.progress >= firstSessionTargetProgress
 * is moved from the `fresh` bucket to the `review` bucket before
 * capping. This means a well-learned card counts toward the
 * user's reviewsPerDay instead of newPerDay, getting the right
 * scheduling pressure without an extra "graduated" state.
 */
import type { Card, CardState } from "@prisma/client";
import type { FsrsStateName } from "./card-adapter";

export type QueueItem = {
  cardId: string;
  type: string;
  frontContent: string | null;
  backContent: string | null;
  isFavorite: boolean;
  suspended: boolean;
  fsrs: {
    state: FsrsStateName;
    due: string;
    reps: number;
  };
};

export type QueueResult = {
  queue: QueueItem[];
  newCount: number;
  learnCount: number;
  reviewCount: number;
  caps: { new: number; reviews: number };
  /**
   * Total non-suspended favorite cards in the input (cap before).
   * Always populated so the UI can render "N favorites" badges
   * regardless of whether `favoritesOnly` is on. When
   * `favoritesOnly` is true, this equals the number of items
   * actually in `queue` (modulo caps).
   */
  favoritesCount: number;
};

type InputCard = Card & { cardState: CardState | null };

/**
 * The plan parameter carries all StudyPlan fields. `newPerDay` and
 * `reviewsPerDay` are the daily caps. `firstSessionTargetProgress`
 * is the optional 0-1 threshold for the re-bucket (default 1.0 =
 * never re-bucket, preserves pre-08-04 behavior when callers
 * don't pass it).
 */
export type StudyPlanShape = {
  newPerDay: number;
  reviewsPerDay: number;
  firstSessionTargetProgress?: number;
};

export function buildQueue(
  cards: InputCard[],
  plan: StudyPlanShape,
  now: Date,
  options?: { favoritesOnly?: boolean }
): QueueResult {
  // Normalize `now` to a fresh Date so the comparison is stable
  // regardless of how the caller built the argument.
  const nowDate = new Date(now);
  // Phase 7-02: server-side "favorites only" filter. Double-defense
  // — callers (page.tsx) should also pre-filter at the prisma layer,
  // but the lib re-checks because cards are typed as a plain array
  // and any future caller could pass an unfiltered deck. Default
  // false preserves the prior behavior bit-for-bit.
  const favoritesOnly = options?.favoritesOnly === true;
  // Phase 08-04: the re-bucket threshold. Default 1.0 = never
  // re-bucket (preserves the pre-08-04 behavior when callers pass
  // a 2-field plan object without firstSessionTargetProgress).
  const graduatedThreshold = plan.firstSessionTargetProgress ?? 1.0;

  const learning: InputCard[] = [];
  const review: InputCard[] = [];
  const fresh: InputCard[] = [];
  // Count non-suspended favorite cards for the UI's "N favorites"
  // badge. Always computed (even when favoritesOnly=false) so the
  // total is available regardless of mode.
  let favoritesCount = 0;

  for (const card of cards) {
    // Defensive suspended filter — callers should pre-filter, but a
    // suspended card must never reach the study session.
    if (card.suspended) continue;
    // Accumulate favorites count first so it's available even when
    // the card is later dropped by the favoritesOnly filter below.
    if (card.isFavorite) favoritesCount++;
    // Phase 7-02: favorites-only mode skips non-favorite cards
    // before bucketing, so they don't inflate newCount / learnCount
    // / reviewCount or sneak into the queue via the fresh pile.
    if (favoritesOnly && !card.isFavorite) continue;

    const state = card.cardState;
    if (state === null || state.state === "new") {
      fresh.push(card);
      continue;
    }
    if (state.state === "learning" || state.state === "relearning") {
      if (state.due !== null && state.due <= nowDate) {
        learning.push(card);
      }
      continue;
    }
    if (state.state === "review") {
      if (state.due !== null && state.due <= nowDate) {
        review.push(card);
      }
      continue;
    }
  }

  // Phase 08-04: re-bucket "new" cards whose FSRS 6 progress
  // already crossed the first-session threshold. They leave the
  // fresh pile and join the review pile (capped by
  // reviewsPerDay, sorted with the rest of the review cards).
  const graduatedFromFresh: InputCard[] = [];
  const stillFresh: InputCard[] = [];
  for (const card of fresh) {
    if (card.progress >= graduatedThreshold) {
      graduatedFromFresh.push(card);
    } else {
      stillFresh.push(card);
    }
  }
  // The augmented review pile keeps the original review cards
  // first (so they sort by due-date), then appends the graduated
  // cards (they'll sort by createdAt below).
  const reviewAugmented: InputCard[] = [...review, ...graduatedFromFresh];

  // Bucket-internal sorting.
  learning.sort(
    (a, b) => (a.cardState!.due!.getTime() - b.cardState!.due!.getTime())
  );
  // review includes both original reviews AND graduated fresh.
  // Both have cardState; sort by due ascending, falling back to
  // createdAt for graduated cards (whose due might be far future).
  reviewAugmented.sort((a, b) => {
    const aDue = a.cardState?.due?.getTime() ?? a.createdAt.getTime();
    const bDue = b.cardState?.due?.getTime() ?? b.createdAt.getTime();
    return aDue - bDue;
  });
  stillFresh.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Apply caps. Learning has no cap.
  const reviewSliced = reviewAugmented.slice(0, plan.reviewsPerDay);
  const freshSliced = stillFresh.slice(0, plan.newPerDay);

  const queue: QueueItem[] = [
    ...learning.map(toQueueItem),
    ...reviewSliced.map(toQueueItem),
    ...freshSliced.map(toQueueItem),
  ];

  return {
    queue,
    // Phase 08-04: the uncapped counts reflect the post-rebucket
    // state. reviewCount now includes graduated fresh cards, so
    // the deck hero ("new N · learning N · review N") tells the
    // truth about today's mix.
    newCount: stillFresh.length,
    learnCount: learning.length,
    reviewCount: reviewAugmented.length,
    caps: { new: plan.newPerDay, reviews: plan.reviewsPerDay },
    favoritesCount,
  };
}

function toQueueItem(card: InputCard): QueueItem {
  const state = card.cardState;
  return {
    cardId: card.id,
    type: card.type,
    frontContent: card.frontContent,
    backContent: card.backContent,
    isFavorite: card.isFavorite,
    suspended: card.suspended,
    fsrs: {
      state: (state?.state as FsrsStateName | undefined) ?? "new",
      due: (state?.due ?? card.createdAt).toISOString(),
      reps: state?.reps ?? 0,
    },
  };
}
