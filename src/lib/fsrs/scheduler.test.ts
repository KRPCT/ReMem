import { describe, it, expect, vi, beforeEach } from "vitest";
import { Rating } from "ts-fsrs";

// Hoisted mock factories — these run before the module imports below.
const mockFsrsInstance = vi.hoisted(() => ({
  next: vi.fn(),
}));
// Phase 08-04 (D-08): track the params passed to fsrs() so we can
// assert that relearning_steps=2 is plumbed through. Without a
// vi.fn wrapper the original `fsrs: () => mockFsrsInstance` mock
// discards the param.
const mockFsrsFn = vi.hoisted(() => vi.fn(() => mockFsrsInstance));
const mockTransaction = vi.hoisted(() => vi.fn());
const mockTx = vi.hoisted(() => ({
  card: {
    findFirst: vi.fn(),
    // Phase 08-02: answerCard writes Card.progress in the same
    // $transaction after the CardState upsert. Mocked here so the
    // 2 new progress-write tests can assert on its payload.
    update: vi.fn(),
  },
  cardState: {
    upsert: vi.fn(),
  },
  reviewLog: {
    create: vi.fn(),
  },
  // Phase 08 fix: answerCard now reads StudyPlan.firstSessionTargetProgress
  // to decide first-session graduation. Default mock = no plan row.
  studyPlan: {
    findUnique: vi.fn(),
  },
}));

vi.mock("ts-fsrs", async () => {
  const actual = await vi.importActual<typeof import("ts-fsrs")>("ts-fsrs");
  return {
    ...actual,
    fsrs: mockFsrsFn,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import { answerCard, RATING_FROM_API } from "./scheduler";
import { Prisma } from "@prisma/client";

const FAKE_NOW = new Date("2026-06-07T10:00:00Z");

function fakeNextCard() {
  return {
    due: new Date("2026-06-08T10:00:00Z"),
    stability: 1.234,
    difficulty: 5.6,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    last_review: FAKE_NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)
  );
  mockFsrsInstance.next.mockReturnValue({
    card: fakeNextCard(),
    log: { rating: Rating.Good },
  });
  mockTx.cardState.upsert.mockResolvedValue({
    id: "cs1",
    cardId: "c1",
    userId: "u1",
    stability: 1.234,
    difficulty: 5.6,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 1,
    lapses: 0,
    state: "review",
    lastReview: FAKE_NOW,
    due: new Date("2026-06-08T10:00:00Z"),
    createdAt: FAKE_NOW,
    updatedAt: FAKE_NOW,
  });
  mockTx.reviewLog.create.mockResolvedValue({});
  mockTx.card.update.mockResolvedValue({});
  // Default: deck has no StudyPlan → threshold falls back to 1.0 =
  // graduation never fires = pre-fix behavior.
  mockTx.studyPlan.findUnique.mockResolvedValue(null);
});

describe("RATING_FROM_API", () => {
  it("maps 1..4 to Rating.Again / Hard / Good / Easy", () => {
    expect(RATING_FROM_API[1]).toBe(Rating.Again);
    expect(RATING_FROM_API[2]).toBe(Rating.Hard);
    expect(RATING_FROM_API[3]).toBe(Rating.Good);
    expect(RATING_FROM_API[4]).toBe(Rating.Easy);
  });
});

describe("answerCard", () => {
  it("throws when rating is 5", async () => {
    await expect(
      answerCard({ cardId: "c1", rating: 5, userId: "u1" })
    ).rejects.toThrow("rating 必须是 1..4");
  });

  it("throws when rating is 0", async () => {
    await expect(
      answerCard({ cardId: "c1", rating: 0, userId: "u1" })
    ).rejects.toThrow("rating 必须是 1..4");
  });

  it("throws when the card is missing or owned by another user", async () => {
    mockTx.card.findFirst.mockResolvedValue(null);
    await expect(
      answerCard({ cardId: "c1", rating: 3, userId: "u1" })
    ).rejects.toThrow("卡片不存在或无权访问");
  });

  it("verifies ownership via deck.userId where clause", async () => {
    mockTx.card.findFirst.mockResolvedValue(null);
    await expect(
      answerCard({ cardId: "c1", rating: 3, userId: "u1" })
    ).rejects.toThrow();
    expect(mockTx.card.findFirst).toHaveBeenCalledTimes(1);
    const where = mockTx.card.findFirst.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toEqual({ id: "c1", deck: { userId: "u1" } });
  });

  it("happy path: first review, snapshot is JsonNull, upsert create + reviewLog create", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    const result = await answerCard({
      cardId: "c1",
      rating: 3,
      userId: "u1",
      now: FAKE_NOW,
    });
    expect(result.state.id).toBe("cs1");

    // fsrs().next() called with (card, now, Rating.Good)
    expect(mockFsrsInstance.next).toHaveBeenCalledTimes(1);
    const args = mockFsrsInstance.next.mock.calls[0];
    expect(args?.[1]).toBe(FAKE_NOW);
    expect(args?.[2]).toBe(Rating.Good);

    // upsert creates the CardState row
    expect(mockTx.cardState.upsert).toHaveBeenCalledTimes(1);
    const upsert = mockTx.cardState.upsert.mock.calls[0]?.[0] as {
      where: { cardId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(upsert.where).toEqual({ cardId: "c1" });
    expect(upsert.create.cardId).toBe("c1");
    expect(upsert.create.stability).toBe(1.234);
    expect(upsert.create.state).toBe("review");
    expect(upsert.update.stability).toBe(1.234);

    // ReviewLog.previousState is Prisma.JsonNull because cardState was null
    expect(mockTx.reviewLog.create).toHaveBeenCalledTimes(1);
    const logData = (
      mockTx.reviewLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    ).data;
    expect(logData.cardId).toBe("c1");
    expect(logData.deckId).toBe("d1");
    expect(logData.userId).toBe("u1");
    expect(logData.rating).toBe(3);
    expect(logData.previousState).toBe(Prisma.JsonNull);
  });

  it("captures all 9 previousState fields when cardState exists", async () => {
    const lastReview = new Date("2026-06-01T10:00:00Z");
    const due = new Date("2026-06-07T10:00:00Z");
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: {
        stability: 1.5,
        difficulty: 4.2,
        elapsedDays: 3,
        scheduledDays: 7,
        reps: 5,
        lapses: 1,
        state: "review",
        lastReview,
        due,
      },
    });

    await answerCard({ cardId: "c1", rating: 3, userId: "u1", now: FAKE_NOW });

    const logData = (
      mockTx.reviewLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    ).data;
    const prev = logData.previousState as Record<string, unknown>;
    expect(prev.stability).toBe(1.5);
    expect(prev.difficulty).toBe(4.2);
    expect(prev.elapsedDays).toBe(3);
    expect(prev.scheduledDays).toBe(7);
    expect(prev.reps).toBe(5);
    expect(prev.lapses).toBe(1);
    expect(prev.state).toBe("review");
    expect(prev.lastReview).toBe(lastReview.toISOString());
    expect(prev.due).toBe(due.toISOString());
  });

  it("uses the injected now value when provided", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    await answerCard({
      cardId: "c1",
      rating: 3,
      userId: "u1",
      now: FAKE_NOW,
    });
    const args = mockFsrsInstance.next.mock.calls[0];
    expect(args?.[1]).toBe(FAKE_NOW);
  });

  // Phase 08-04 (D-08): the only allowed FSRS 6 deviation in v1.
  // relearning_steps is a TWO-step array (vs ts-fsrs default one-step
  // ["10m"]) so a forgetting event gets an extra relearning rep.
  // Phase 08 fix: the param is a Steps array of durations, not a count
  // — the old `relearning_steps: 2` was silently ignored by ts-fsrs.
  it("Phase 08-04 D-08: instantiates fsrs with a 2-step relearning_steps array", async () => {
    mockFsrsFn.mockClear();
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    await answerCard({ cardId: "c1", rating: 3, userId: "u1" });
    expect(mockFsrsFn).toHaveBeenCalledWith({
      relearning_steps: ["10m", "20m"],
    });
  });

  it("invokes the operations inside a $transaction callback", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    await answerCard({ cardId: "c1", rating: 3, userId: "u1" });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction.mock.calls[0]?.[0]).toBeInstanceOf(Function);
  });

  // ── Phase 08-02: per-card FSRS 6 progress write (Hybrid formula) ───
  // The answerCard flow writes `Card.progress` in the same $transaction
  // after the CardState upsert. The Hybrid formula branches on
  // newState.state:
  //   new/learning/relearning → rating step table
  //   review                   → R(t) = (1 + t/(9S))^(-1)

  it("v2: first day (studyDays=1) is rating-capped — Good → 0.62 regardless of state", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    // v2 day-1 ignores stability/state entirely: a brand-new Good answer is
    // the first-day step value 0.62 even though ts-fsrs put it in `review`.
    await answerCard({ cardId: "c1", rating: 3, userId: "u1" });
    expect(mockTx.card.update).toHaveBeenCalledTimes(1);
    const updateArg = mockTx.card.update.mock.calls[0]?.[0];
    expect(updateArg).toMatchObject({
      where: { id: "c1" },
      data: { progress: 0.62 },
    });
    expect(updateArg?.data?.progress as number).toBeGreaterThanOrEqual(0);
    expect(updateArg?.data?.progress as number).toBeLessThanOrEqual(1);
  });

  it("v2: new + Good on day 1 → progress = 0.62", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    // New + Good → learning → v2 first-day step = 0.62.
    mockFsrsInstance.next.mockReturnValue({
      card: { ...fakeNextCard(), state: 1, stability: 0.5, elapsed_days: 0 },
      log: { rating: Rating.Good },
    });
    await answerCard({ cardId: "c1", rating: 3, userId: "u1" });
    const updateArg = mockTx.card.update.mock.calls[0]?.[0];
    expect(updateArg?.data?.progress).toBeCloseTo(0.62, 6);
  });

  it("v2: lapse scenario — new + Again → progress = 0 (nothing learned yet)", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    // learning + Again → 0 (first-pass lapse).
    mockFsrsInstance.next.mockReturnValue({
      card: { ...fakeNextCard(), state: 1, stability: 0, elapsed_days: 0 },
      log: { rating: Rating.Again },
    });
    await answerCard({ cardId: "c1", rating: 1, userId: "u1" });
    const updateArg = mockTx.card.update.mock.calls[0]?.[0];
    expect(updateArg?.data?.progress).toBe(0);
  });

  it("v2: day-1 progress ignores stability/elapsed (rating-driven) — Good → 0.62", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    // Even a review-state result with elapsed=9 yields the day-1 rating step
    // (0.62), not the old R(9)=0.5 — stability only drives progress from day 2.
    mockFsrsInstance.next.mockReturnValue({
      card: { ...fakeNextCard(), state: 2, stability: 1, elapsed_days: 9 },
      log: { rating: Rating.Good },
    });
    await answerCard({ cardId: "c1", rating: 3, userId: "u1" });
    const updateArg = mockTx.card.update.mock.calls[0]?.[0];
    expect(updateArg?.data?.progress).toBeCloseTo(0.62, 6);
  });

  // ── Phase 08 fix: first-session graduation (PROG-04, D-09..D-12) ──
  // StudyPlan.firstSessionTargetProgress now actually affects when a
  // card enters `review`. answerCard graduates a still-`learning` card
  // early (accelerator-only) when its first-answer progress reached the
  // threshold. Verifies the feature is no longer dead code.

  it("graduates a first-session card to review when progress reaches the StudyPlan threshold", async () => {
    // Brand-new card (preState = new). ts-fsrs moves it to learning
    // (state=1) with Good → tentative progress = 0.67 (learning table).
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    mockFsrsInstance.next.mockReturnValue({
      card: {
        ...fakeNextCard(),
        state: 1, // Learning
        stability: 0.8,
        elapsed_days: 0,
        learning_steps: 1,
      },
      log: { rating: Rating.Good },
    });
    // Threshold 0.6 ≤ 0.67 → graduate.
    mockTx.studyPlan.findUnique.mockResolvedValue({
      firstSessionTargetProgress: 0.6,
    });
    // After the override, the persisted row is review/S=1.0 → final
    // progress R(0)=1.0.
    mockTx.cardState.upsert.mockResolvedValue({
      id: "cs1",
      cardId: "c1",
      userId: "u1",
      stability: 1.0,
      difficulty: 5.6,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      state: "review",
      lastReview: FAKE_NOW,
      due: new Date(FAKE_NOW.getTime() + 24 * 60 * 60 * 1000),
      createdAt: FAKE_NOW,
      updatedAt: FAKE_NOW,
    });

    await answerCard({ cardId: "c1", rating: 3, userId: "u1", now: FAKE_NOW });

    // The CardState write was overridden to review / S=1.0 / step 0.
    const create = mockTx.cardState.upsert.mock.calls[0]?.[0]?.create as Record<
      string,
      unknown
    >;
    expect(create.state).toBe("review");
    expect(create.stability).toBe(1.0);
    expect(create.learningSteps).toBe(0);
    expect(create.scheduledDays).toBe(1);
    expect((create.due as Date).getTime()).toBe(
      FAKE_NOW.getTime() + 24 * 60 * 60 * 1000
    );
    // v2: graduation happens on the first day (studyDays=1), so progress stays
    // the rating-capped day-1 value (Good = 0.62), not the old R(0) = 1.0.
    expect(mockTx.card.update.mock.calls[0]?.[0]?.data?.progress).toBeCloseTo(
      0.62,
      6
    );
  });

  it("does NOT graduate early at the default threshold (no plan) — card stays learning", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    mockFsrsInstance.next.mockReturnValue({
      card: {
        ...fakeNextCard(),
        state: 1, // Learning
        stability: 0.8,
        elapsed_days: 0,
        learning_steps: 1,
      },
      log: { rating: Rating.Good },
    });
    // No StudyPlan row → threshold defaults to 1.0 → 0.67 < 1.0 → no graduate.
    mockTx.studyPlan.findUnique.mockResolvedValue(null);
    mockTx.cardState.upsert.mockResolvedValue({
      id: "cs1",
      cardId: "c1",
      userId: "u1",
      stability: 0.8,
      difficulty: 5.6,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 1,
      lapses: 0,
      state: "learning",
      lastReview: FAKE_NOW,
      due: FAKE_NOW,
      createdAt: FAKE_NOW,
      updatedAt: FAKE_NOW,
    });

    await answerCard({ cardId: "c1", rating: 3, userId: "u1", now: FAKE_NOW });

    const create = mockTx.cardState.upsert.mock.calls[0]?.[0]?.create as Record<
      string,
      unknown
    >;
    expect(create.state).toBe("learning"); // unchanged — no early graduation
  });

  it("never clobbers a card ts-fsrs already graduated to review (accelerator-only)", async () => {
    // ts-fsrs graduates Easy straight to review (state=2) with a real
    // multi-day stability. Even with a low threshold, the override must
    // NOT fire (state is already review, not learning) — so the
    // ts-fsrs stability is preserved, not forced to 1.0.
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      deckId: "d1",
      cardState: null,
    });
    mockFsrsInstance.next.mockReturnValue({
      card: {
        ...fakeNextCard(),
        state: 2, // Review (ts-fsrs graduated)
        stability: 4.2,
        elapsed_days: 0,
      },
      log: { rating: Rating.Easy },
    });
    mockTx.studyPlan.findUnique.mockResolvedValue({
      firstSessionTargetProgress: 0.5,
    });

    await answerCard({ cardId: "c1", rating: 4, userId: "u1", now: FAKE_NOW });

    const create = mockTx.cardState.upsert.mock.calls[0]?.[0]?.create as Record<
      string,
      unknown
    >;
    expect(create.state).toBe("review");
    // ts-fsrs stability preserved — NOT forced to the graduation seed 1.0.
    expect(create.stability).toBe(4.2);
  });
});
