import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — declared before the module under test loads.
const mockReviewLogFindMany = vi.hoisted(() => vi.fn());
const mockCardFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reviewLog: { findMany: mockReviewLogFindMany },
    card: { findMany: mockCardFindMany },
  },
}));

import { recommendStudyPlanForDeck } from "./smart-recommend";

const USER_ID = "u1";
const DECK_ID = "d1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recommendStudyPlanForDeck (Phase 08-04)", () => {
  it("returns Anki Desktop defaults when user has no history", async () => {
    mockReviewLogFindMany.mockResolvedValue([]);
    mockCardFindMany.mockResolvedValue([]);
    const result = await recommendStudyPlanForDeck(USER_ID, DECK_ID);
    expect(result.source).toBe("anki-default-fallback");
    expect(result.newPerDay).toBe(20);
    expect(result.reviewsPerDay).toBe(200);
    expect(result.requestRetention).toBe(0.9);
    expect(result.enableFuzz).toBe(true);
    expect(result.enableShortTerm).toBe(true);
    expect(result.firstSessionTargetProgress).toBe(0.8);
    // Rationale strings should mention the fallback reason
    expect(result.rationale.newPerDay).toContain("Anki Desktop 默认");
  });

  it("computes reviewsPerDay as the median of 30-day daily review counts", async () => {
    // 7 distinct days, varying reviews/day
    const logs = [];
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      const count = [50, 60, 70, 80, 90, 100, 200][day - 1]!;
      for (let i = 0; i < count; i++) {
        logs.push({
          rating: 3,
          reviewedAt: new Date(`2026-06-0${day}T12:00:00Z`),
        });
      }
    }
    mockReviewLogFindMany.mockResolvedValue(logs);
    mockCardFindMany.mockResolvedValue([]);

    const result = await recommendStudyPlanForDeck(USER_ID, DECK_ID);
    // Sorted counts: 50, 60, 70, 80, 90, 100, 200. Median (7 items) = 80.
    expect(result.reviewsPerDay).toBe(80);
    expect(result.source).toBe("user-history-30d");
  });

  it("computes newPerDay as the median of 30-day daily new-card counts", async () => {
    mockReviewLogFindMany.mockResolvedValue([
      { rating: 3, reviewedAt: new Date("2026-06-07T12:00:00Z") },
    ]);
    // 5 days, varying new cards/day
    const cards = [];
    for (const day of [1, 2, 3, 4, 5]) {
      const count = [3, 5, 7, 9, 11][day - 1]!;
      for (let i = 0; i < count; i++) {
        cards.push({
          createdAt: new Date(`2026-06-0${day}T00:00:00Z`),
          cardState: { reps: 1 },
        });
      }
    }
    mockCardFindMany.mockResolvedValue(cards);

    const result = await recommendStudyPlanForDeck(USER_ID, DECK_ID);
    // Sorted counts: 3, 5, 7, 9, 11. Median = 7.
    expect(result.newPerDay).toBe(7);
  });

  it("ignores new cards that have never been reviewed (reps=0)", async () => {
    mockReviewLogFindMany.mockResolvedValue([]);
    // 5 cards, all reps=0 (suspended or never seen)
    mockCardFindMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({
        createdAt: new Date("2026-06-07T00:00:00Z"),
        cardState: { reps: 0 },
      }))
    );
    const result = await recommendStudyPlanForDeck(USER_ID, DECK_ID);
    // Falls back to defaults because no new introductions and no reviews
    expect(result.source).toBe("anki-default-fallback");
    expect(result.newPerDay).toBe(20);
  });
});
