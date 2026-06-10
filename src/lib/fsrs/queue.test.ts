import { describe, it, expect } from "vitest";
import type { Card, CardState } from "@prisma/client";
import { buildQueue, STUDY_PLAN_DEFAULTS } from "./index";

type CardWithState = Card & { cardState: CardState | null };

function mkCard(opts: {
  id: string;
  cardState?: Partial<CardState> | null;
  suspended?: boolean;
  createdAt?: Date;
  type?: string;
  frontContent?: string | null;
  backContent?: string | null;
  isFavorite?: boolean;
  // Phase 08-04: per-card FSRS 6 progress (0-1 float). The
  // buildQueue re-bucket uses this to graduate new cards whose
  // progress has already crossed firstSessionTargetProgress.
  progress?: number;
}): CardWithState {
  const createdAt = opts.createdAt ?? new Date("2026-06-01T00:00:00Z");
  const cardState =
    opts.cardState === undefined
      ? null
      : opts.cardState === null
        ? null
        : ({
            id: `cs-${opts.id}`,
            cardId: opts.id,
            userId: "u1",
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: "new",
            lastReview: null,
            due: null,
            createdAt,
            updatedAt: createdAt,
            ...opts.cardState,
          } as CardState);
  return {
    id: opts.id,
    deckId: "d1",
    type: opts.type ?? "qa",
    frontContent: opts.frontContent ?? `front-${opts.id}`,
    backContent: opts.backContent ?? `back-${opts.id}`,
    typeData: null,
    isFavorite: opts.isFavorite ?? false,
    suspended: opts.suspended ?? false,
    shuffleOptOut: false,
    // Phase 08-04: default 0 = a brand-new card with no reviews yet.
    createdAt,
    updatedAt: createdAt,
    progress: opts.progress ?? 0,
    cardState,
  } as unknown as CardWithState;
}

const NOW = new Date("2026-06-07T12:00:00Z");

describe("buildQueue", () => {
  it("returns empty queue + zero counts for empty input", () => {
    const result = buildQueue([], STUDY_PLAN_DEFAULTS, NOW);
    expect(result.queue).toEqual([]);
    expect(result.newCount).toBe(0);
    expect(result.learnCount).toBe(0);
    expect(result.reviewCount).toBe(0);
    expect(result.caps).toEqual({ new: 20, reviews: 200 });
  });

  it("buckets cards with null cardState into the new pile", () => {
    const cards = [mkCard({ id: "a" }), mkCard({ id: "b" }), mkCard({ id: "c" })];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW);
    expect(result.queue).toHaveLength(3);
    expect(result.newCount).toBe(3);
    expect(result.learnCount).toBe(0);
    expect(result.reviewCount).toBe(0);
    for (const item of result.queue) {
      expect(item.fsrs.state).toBe("new");
    }
  });

  it("enqueues learning cards whose due is in the past", () => {
    const cards = [
      mkCard({
        id: "a",
        cardState: {
          state: "learning",
          due: new Date("2026-06-01T00:00:00Z"),
        },
      }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW);
    expect(result.learnCount).toBe(1);
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.fsrs.state).toBe("learning");
  });

  it("does not enqueue review cards whose due is in the future", () => {
    const cards = [
      mkCard({
        id: "a",
        cardState: {
          state: "review",
          due: new Date("2026-06-08T00:00:00Z"),
        },
      }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW);
    expect(result.reviewCount).toBe(0);
    expect(result.queue).toHaveLength(0);
  });

  it("does not cap learning cards even with zero plan caps", () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      mkCard({
        id: `l${i}`,
        cardState: {
          state: "learning",
          due: new Date(`2026-06-0${i + 1}T00:00:00Z`),
        },
      })
    );
    const result = buildQueue(
      cards,
      { newPerDay: 0, reviewsPerDay: 0 },
      NOW
    );
    expect(result.queue).toHaveLength(5);
    expect(result.learnCount).toBe(5);
  });

  it("caps the new pile at plan.newPerDay", () => {
    const cards = Array.from({ length: 25 }, (_, i) => mkCard({ id: `n${i}` }));
    const result = buildQueue(
      cards,
      { newPerDay: 20, reviewsPerDay: 200 },
      NOW
    );
    expect(result.queue).toHaveLength(20);
    expect(result.newCount).toBe(25);
  });

  it("caps the review pile at plan.reviewsPerDay", () => {
    const cards = Array.from({ length: 250 }, (_, i) =>
      mkCard({
        id: `r${i}`,
        cardState: {
          state: "review",
          due: new Date("2026-06-01T00:00:00Z"),
        },
      })
    );
    const result = buildQueue(
      cards,
      { newPerDay: 999, reviewsPerDay: 200 },
      NOW
    );
    expect(result.queue).toHaveLength(200);
    expect(result.reviewCount).toBe(250);
  });

  it("filters out suspended cards", () => {
    const cards = [
      mkCard({ id: "a" }),
      mkCard({ id: "b", suspended: true }),
      mkCard({ id: "c" }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW);
    expect(result.queue).toHaveLength(2);
    expect(result.queue.map((q) => q.cardId).sort()).toEqual(["a", "c"]);
  });

  it("orders the queue learning > review > new", () => {
    const cards = [
      mkCard({ id: "n1" }),
      mkCard({ id: "n2" }),
      mkCard({ id: "n3" }),
      mkCard({ id: "n4" }),
      mkCard({
        id: "r1",
        cardState: {
          state: "review",
          due: new Date("2026-06-05T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r2",
        cardState: {
          state: "review",
          due: new Date("2026-06-04T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r3",
        cardState: {
          state: "review",
          due: new Date("2026-06-06T00:00:00Z"),
        },
      }),
      mkCard({
        id: "l1",
        cardState: {
          state: "learning",
          due: new Date("2026-06-03T00:00:00Z"),
        },
      }),
      mkCard({
        id: "l2",
        cardState: {
          state: "learning",
          due: new Date("2026-06-02T00:00:00Z"),
        },
      }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW);

    // First the 2 learning cards, sorted by due asc.
    expect(result.queue.slice(0, 2).map((q) => q.cardId)).toEqual(["l2", "l1"]);
    // Then the 3 review cards, sorted by due asc.
    expect(result.queue.slice(2, 5).map((q) => q.cardId)).toEqual([
      "r2",
      "r1",
      "r3",
    ]);
    // Then the 4 new cards, sorted by createdAt asc (n1..n4 inserted in order).
    expect(result.queue.slice(5).map((q) => q.cardId)).toEqual([
      "n1",
      "n2",
      "n3",
      "n4",
    ]);
  });

  it("returns caps as the plan that was passed in", () => {
    const result = buildQueue([], { newPerDay: 7, reviewsPerDay: 33 }, NOW);
    expect(result.caps).toEqual({ new: 7, reviews: 33 });
  });
});

/**
 * Phase 7-02: `favoritesOnly` server-side filter. The lib accepts an
 * optional 4th arg; default behavior must be unchanged (zero
 * regression on the 11+ cases above), and when the flag is true
 * the queue + counts + favoritesCount all reflect the filtered
 * subset.
 */
describe("buildQueue favoritesOnly", () => {
  it("default (no options) does not filter and counts all favorites", () => {
    const cards = [
      mkCard({
        id: "r1",
        isFavorite: true,
        cardState: {
          state: "review",
          due: new Date("2026-06-05T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r2",
        isFavorite: true,
        cardState: {
          state: "review",
          due: new Date("2026-06-06T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r3",
        cardState: {
          state: "review",
          due: new Date("2026-06-04T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r4",
        cardState: {
          state: "review",
          due: new Date("2026-06-03T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r5",
        cardState: {
          state: "review",
          due: new Date("2026-06-02T00:00:00Z"),
        },
      }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW);
    // No filter applied: all 5 review cards queued (cap is 200).
    expect(result.queue).toHaveLength(5);
    expect(result.reviewCount).toBe(5);
    // All 2 favorited cards counted (none suspended).
    expect(result.favoritesCount).toBe(2);
  });

  it("explicit favoritesOnly=false behaves the same as the default", () => {
    const cards = [
      mkCard({
        id: "r1",
        isFavorite: true,
        cardState: {
          state: "review",
          due: new Date("2026-06-05T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r2",
        cardState: {
          state: "review",
          due: new Date("2026-06-04T00:00:00Z"),
        },
      }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW, {
      favoritesOnly: false,
    });
    expect(result.queue).toHaveLength(2);
    expect(result.favoritesCount).toBe(1);
  });

  it("favoritesOnly=true with zero favorites returns an empty queue", () => {
    const cards = [
      mkCard({
        id: "r1",
        cardState: {
          state: "review",
          due: new Date("2026-06-05T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r2",
        cardState: {
          state: "review",
          due: new Date("2026-06-04T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r3",
        cardState: {
          state: "review",
          due: new Date("2026-06-03T00:00:00Z"),
        },
      }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW, {
      favoritesOnly: true,
    });
    expect(result.queue).toEqual([]);
    expect(result.newCount).toBe(0);
    expect(result.learnCount).toBe(0);
    expect(result.reviewCount).toBe(0);
    expect(result.favoritesCount).toBe(0);
  });

  it("favoritesOnly=true keeps only favorited review cards, sorted by due", () => {
    const cards = [
      mkCard({
        id: "r1",
        isFavorite: true,
        cardState: {
          state: "review",
          due: new Date("2026-06-05T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r2",
        cardState: {
          state: "review",
          due: new Date("2026-06-06T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r3",
        isFavorite: true,
        cardState: {
          state: "review",
          due: new Date("2026-06-04T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r4",
        cardState: {
          state: "review",
          due: new Date("2026-06-07T00:00:00Z"),
        },
      }),
      mkCard({
        id: "r5",
        cardState: {
          state: "review",
          due: new Date("2026-06-03T00:00:00Z"),
        },
      }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW, {
      favoritesOnly: true,
    });
    // Only the 2 favorited cards survive; reviewCount reflects the
    // filtered bucket, not the input length.
    expect(result.queue.map((q) => q.cardId)).toEqual(["r3", "r1"]);
    expect(result.reviewCount).toBe(2);
    expect(result.favoritesCount).toBe(2);
  });

  it("favoritesOnly=true filters across all three buckets simultaneously", () => {
    const cards = [
      mkCard({
        id: "l1",
        isFavorite: true,
        cardState: {
          state: "learning",
          due: new Date("2026-06-05T00:00:00Z"),
        },
      }),
      mkCard({
        id: "l2",
        cardState: {
          state: "learning",
          due: new Date("2026-06-04T00:00:00Z"),
        },
      }),
      mkCard({
        id: "rv1",
        isFavorite: true,
        cardState: {
          state: "review",
          due: new Date("2026-06-05T00:00:00Z"),
        },
      }),
      mkCard({
        id: "rv2",
        cardState: {
          state: "review",
          due: new Date("2026-06-04T00:00:00Z"),
        },
      }),
      mkCard({ id: "n1" }),
      mkCard({ id: "n2", isFavorite: true }),
    ];
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, NOW, {
      favoritesOnly: true,
    });
    // Filtered: l1 (learning), rv1 (review), n2 (new, kept by FIFO
    // order — n1 dropped as non-favorite). Bucket order is
    // learning > review > new.
    expect(result.queue.map((q) => q.cardId)).toEqual(["l1", "rv1", "n2"]);
    expect(result.learnCount).toBe(1);
    expect(result.reviewCount).toBe(1);
    expect(result.newCount).toBe(1);
    // Both l1 and n2 and rv1 are favorited; l2 / rv2 / n1 are not.
    expect(result.favoritesCount).toBe(3);
  });

  it("favoritesOnly=true does not cap the learning bucket", () => {
    // Learning has no daily cap — even with plan caps of 0 the
    // filtered learning cards must all be enqueued, because the
    // user must see all due learning cards to graduate them.
    const cards = Array.from({ length: 5 }, (_, i) =>
      mkCard({
        id: `l${i}`,
        isFavorite: true,
        cardState: {
          state: "learning",
          due: new Date(`2026-06-0${i + 1}T00:00:00Z`),
        },
      })
    );
    const result = buildQueue(
      cards,
      { newPerDay: 0, reviewsPerDay: 0 },
      NOW,
      { favoritesOnly: true }
    );
    expect(result.queue).toHaveLength(5);
    expect(result.learnCount).toBe(5);
    expect(result.favoritesCount).toBe(5);
  });
});

describe("buildQueue firstSessionTargetProgress (Phase 08-04)", () => {
  // A "new" card whose Card.progress has already crossed the
  // user's first-session threshold moves from the fresh bucket to
  // the review bucket. It then counts toward reviewsPerDay, not
  // newPerDay, getting the right scheduling pressure without
  // needing a separate "graduated" state.
  it("Phase 08-04: new card with progress >= threshold moves to review bucket", () => {
    const cards = [
      // Fresh card with high progress (already well-learned)
      mkCard({
        id: "c1",
        cardState: { state: "new", reps: 0 },
        createdAt: NOW,
        progress: 0.85,
      }),
    ];
    const result = buildQueue(
      cards,
      { newPerDay: 9999, reviewsPerDay: 9999, firstSessionTargetProgress: 0.8 },
      NOW
    );
    expect(result.newCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(result.queue).toHaveLength(1);
  });

  it("Phase 08-04: new card with progress < threshold stays in new bucket", () => {
    const cards = [
      mkCard({
        id: "c1",
        cardState: { state: "new", reps: 0 },
        createdAt: NOW,
        progress: 0.5,
      }),
    ];
    const result = buildQueue(
      cards,
      { newPerDay: 9999, reviewsPerDay: 9999, firstSessionTargetProgress: 0.8 },
      NOW
    );
    expect(result.newCount).toBe(1);
    expect(result.reviewCount).toBe(0);
  });

  it("Phase 08-04: progress=0 stays in new bucket", () => {
    const cards = [
      mkCard({
        id: "c1",
        cardState: { state: "new", reps: 0 },
        createdAt: NOW,
      }),
    ];
    const result = buildQueue(
      cards,
      { newPerDay: 9999, reviewsPerDay: 9999, firstSessionTargetProgress: 0.8 },
      NOW
    );
    expect(result.newCount).toBe(1);
    expect(result.reviewCount).toBe(0);
  });

  it("Phase 08-04: mixed — 1 review + 1 graduated + 1 still-new = 2 review + 1 new", () => {
    const due = new Date("2026-06-07T00:00:00Z");
    const cards = [
      // Actual review card (state=review, due <= now)
      mkCard({
        id: "r1",
        cardState: { state: "review", due, reps: 5 },
        createdAt: NOW,
        progress: 0.9,
      }),
      // New card that graduated
      mkCard({
        id: "g1",
        cardState: { state: "new", reps: 0 },
        createdAt: NOW,
        progress: 0.85,
      }),
      // New card that didn't graduate
      mkCard({
        id: "n1",
        cardState: { state: "new", reps: 0 },
        createdAt: NOW,
        progress: 0.3,
      }),
    ];
    const result = buildQueue(
      cards,
      { newPerDay: 9999, reviewsPerDay: 9999, firstSessionTargetProgress: 0.8 },
      NOW
    );
    expect(result.queue).toHaveLength(3);
    // reviewCount counts the augmented review pile (1 actual + 1 graduated)
    expect(result.reviewCount).toBe(2);
    // newCount counts the still-new pile (1 card)
    expect(result.newCount).toBe(1);
  });

  it("Phase 08-04: backward-compat — plan without firstSessionTargetProgress", () => {
    // Pre-08-04 callers (or tests) pass a 2-field plan object.
    // The threshold defaults to 1.0 = no re-bucket, so a card with
    // mid-range progress stays in new.
    const cards = [
      mkCard({
        id: "c1",
        cardState: { state: "new", reps: 0 },
        createdAt: NOW,
        progress: 0.5,
      }),
    ];
    const result = buildQueue(
      cards,
      { newPerDay: 9999, reviewsPerDay: 9999 },
      NOW
    );
    expect(result.newCount).toBe(1);
    expect(result.reviewCount).toBe(0);
  });
});
