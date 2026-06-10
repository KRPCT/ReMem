import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock factories.
const mockTransaction = vi.hoisted(() => vi.fn());
const mockTx = vi.hoisted(() => ({
  card: {
    findFirst: vi.fn(),
    // Phase 8 progress-v2: undo now restores Card.progress too.
    update: vi.fn(),
  },
  cardState: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  reviewLog: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import { revertLastAnswer } from "./undo";

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)
  );
  mockTx.cardState.upsert.mockResolvedValue({});
  mockTx.cardState.deleteMany.mockResolvedValue({ count: 1 });
  mockTx.reviewLog.update.mockResolvedValue({});
  mockTx.card.update.mockResolvedValue({});
});

describe("revertLastAnswer", () => {
  it("returns { restored: false, reason: 'no-history' } when no log exists", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      cardState: { id: "cs1" },
    });
    mockTx.reviewLog.findFirst.mockResolvedValue(null);

    const result = await revertLastAnswer({ cardId: "c1", userId: "u1" });

    expect(result).toEqual({
      restored: false,
      cardId: "c1",
      reason: "no-history",
    });
    expect(mockTx.cardState.upsert).not.toHaveBeenCalled();
    expect(mockTx.cardState.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.reviewLog.update).not.toHaveBeenCalled();
  });

  it("throws when the card is missing or owned by another user", async () => {
    mockTx.card.findFirst.mockResolvedValue(null);
    await expect(
      revertLastAnswer({ cardId: "c1", userId: "u1" })
    ).rejects.toThrow("卡片不存在或无权访问");
  });

  it("verifies ownership via deck.userId where clause", async () => {
    mockTx.card.findFirst.mockResolvedValue(null);
    await expect(
      revertLastAnswer({ cardId: "c1", userId: "u1" })
    ).rejects.toThrow();
    expect(mockTx.card.findFirst).toHaveBeenCalledTimes(1);
    const where = mockTx.card.findFirst.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toEqual({ id: "c1", deck: { userId: "u1" } });
  });

  it("previousState=null path: deleteMany CardState, do not upsert, mark log undone", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      cardState: { id: "cs1" },
    });
    mockTx.reviewLog.findFirst.mockResolvedValue({
      id: "log1",
      previousState: null,
    });

    const result = await revertLastAnswer({ cardId: "c1", userId: "u1" });

    expect(result.restored).toBe(true);
    expect(result.cardId).toBe("c1");
    expect(mockTx.cardState.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockTx.cardState.deleteMany.mock.calls[0]?.[0]).toEqual({
      where: { cardId: "c1" },
    });
    // v2: a brand-new card's progress is reset to 0 on undo.
    expect(mockTx.card.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { progress: 0 },
    });
    expect(mockTx.cardState.upsert).not.toHaveBeenCalled();
    expect(mockTx.reviewLog.update).toHaveBeenCalledTimes(1);
    const updateData = (
      mockTx.reviewLog.update.mock.calls[0]?.[0] as { data: { undoneAt: Date } }
    ).data;
    expect(updateData.undoneAt).toBeInstanceOf(Date);
  });

  it("previousState=null path: skip deleteMany when cardState was already gone", async () => {
    mockTx.card.findFirst.mockResolvedValue({ id: "c1", cardState: null });
    mockTx.reviewLog.findFirst.mockResolvedValue({
      id: "log1",
      previousState: null,
    });

    const result = await revertLastAnswer({ cardId: "c1", userId: "u1" });

    expect(result.restored).toBe(true);
    expect(mockTx.cardState.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.cardState.upsert).not.toHaveBeenCalled();
    expect(mockTx.reviewLog.update).toHaveBeenCalledTimes(1);
  });

  it("previousState=non-null path: upsert restores all 9 fields with Date types", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      cardState: { id: "cs1" },
    });
    mockTx.reviewLog.findFirst.mockResolvedValue({
      id: "log1",
      previousState: {
        stability: 1.2,
        difficulty: 4.5,
        elapsedDays: 3,
        scheduledDays: 7,
        reps: 5,
        lapses: 1,
        studyDays: 4,
        failCount: 2,
        progress: 0.93,
        state: "review",
        lastReview: "2026-06-01T00:00:00.000Z",
        due: "2026-06-08T00:00:00.000Z",
      },
    });

    const result = await revertLastAnswer({ cardId: "c1", userId: "u1" });

    expect(result.restored).toBe(true);
    expect(mockTx.cardState.upsert).toHaveBeenCalledTimes(1);
    expect(mockTx.cardState.deleteMany).not.toHaveBeenCalled();

    const upsert = mockTx.cardState.upsert.mock.calls[0]?.[0] as {
      where: { cardId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(upsert.where).toEqual({ cardId: "c1" });
    expect(upsert.create.cardId).toBe("c1");
    expect(upsert.create.userId).toBe("u1");
    expect(upsert.create.stability).toBe(1.2);
    expect(upsert.create.difficulty).toBe(4.5);
    expect(upsert.create.elapsedDays).toBe(3);
    expect(upsert.create.scheduledDays).toBe(7);
    expect(upsert.create.reps).toBe(5);
    expect(upsert.create.lapses).toBe(1);
    expect(upsert.create.studyDays).toBe(4);
    expect(upsert.create.failCount).toBe(2);
    expect(upsert.create.state).toBe("review");
    expect(upsert.create.lastReview).toBeInstanceOf(Date);
    expect((upsert.create.lastReview as Date).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z"
    );
    expect(upsert.create.due).toBeInstanceOf(Date);
    expect((upsert.create.due as Date).toISOString()).toBe(
      "2026-06-08T00:00:00.000Z"
    );
    // update branch mirrors the create branch's data
    expect(upsert.update.stability).toBe(1.2);
    expect(upsert.update.state).toBe("review");
    expect(upsert.update.lastReview).toBeInstanceOf(Date);
    expect(upsert.update.due).toBeInstanceOf(Date);

    // Log gets marked undone.
    expect(mockTx.reviewLog.update).toHaveBeenCalledTimes(1);
    const updateArgs = mockTx.reviewLog.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { undoneAt: Date };
    };
    expect(updateArgs.where).toEqual({ id: "log1" });
    expect(updateArgs.data.undoneAt).toBeInstanceOf(Date);

    // v2: the card's high-water progress is restored from the snapshot.
    expect(mockTx.card.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { progress: 0.93 },
    });
  });

  it("is idempotent: a second revert returns restored: false", async () => {
    // First call: a live log exists.
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      cardState: { id: "cs1" },
    });
    mockTx.reviewLog.findFirst.mockResolvedValueOnce({
      id: "log1",
      previousState: null,
    });
    const first = await revertLastAnswer({ cardId: "c1", userId: "u1" });
    expect(first.restored).toBe(true);

    // Second call: the log was already marked undone, so findFirst returns null.
    mockTx.reviewLog.findFirst.mockResolvedValueOnce(null);
    const second = await revertLastAnswer({ cardId: "c1", userId: "u1" });
    expect(second.restored).toBe(false);
    expect(second.reason).toBe("no-history");
  });

  // Review: WR-01 — ensures the Zod validation guard catches
  // corrupted audit-trail rows and returns a non-throwing
  // "corrupt-history" sentinel instead of writing NaN/Invalid Date.
  it("corrupt previousState: Zod-validates the JSON and returns { restored: false, reason: 'corrupt-history' }", async () => {
    mockTx.card.findFirst.mockResolvedValue({
      id: "c1",
      cardState: { id: "cs1" },
    });
    // Bogus snapshot: missing fields + bad state name + NaN stability.
    mockTx.reviewLog.findFirst.mockResolvedValue({
      id: "log1",
      previousState: {
        stability: Number.NaN,
        difficulty: 4.5,
        state: "bogus-state",
      },
    });

    const result = await revertLastAnswer({ cardId: "c1", userId: "u1" });

    expect(result).toEqual({
      restored: false,
      cardId: "c1",
      reason: "corrupt-history",
    });
    // Must NOT have written anything to CardState.
    expect(mockTx.cardState.upsert).not.toHaveBeenCalled();
    expect(mockTx.cardState.deleteMany).not.toHaveBeenCalled();
    // Must NOT have stamped the log as undone (preserve forensic trail).
    expect(mockTx.reviewLog.update).not.toHaveBeenCalled();
  });
});
