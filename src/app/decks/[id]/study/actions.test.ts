import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — must be declared before importing the actions module.
const mockAuth = vi.hoisted(() => vi.fn());
const mockAnswer = vi.hoisted(() => vi.fn());
const mockRevert = vi.hoisted(() => vi.fn());
const mockCardFindFirst = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("../../../../../auth", () => ({ auth: mockAuth }));

// Mock the fsrs lib while preserving its public exports — only the
// two functions under test get stubbed, so a future expand to the
// lib surface does not silently break the test.
vi.mock("@/lib/fsrs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fsrs")>(
    "@/lib/fsrs"
  );
  return {
    ...actual,
    answerCard: mockAnswer,
    revertLastAnswer: mockRevert,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

// `findFirst` is a `vi.fn()` (not directly the hoisted spy) so the
// `beforeEach` block can rebind it to `mockCardFindFirst` for the
// answer/undo tests AND let the toggleFavorite tests override
// per-case return values. `updateMany` is the toggleFavorite-specific
// spy and is left untouched by the answer/undo tests.
// `findUnique` is added in Phase 08-02 so answerCardAction can
// read the freshly-written Card.progress column.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    card: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: mockUpdateMany,
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { answerCardAction, undoCardAction, toggleFavoriteStudyAction } from "./actions";

function mkFd(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const FAKE_STATE = {
  stability: 1.234,
  difficulty: 5.6,
  elapsedDays: 0,
  scheduledDays: 1,
  reps: 1,
  lapses: 0,
  state: "review",
  lastReview: new Date("2026-06-07T10:00:00Z"),
  due: new Date("2026-06-08T10:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Re-bind the hoisted findFirst spy for the answer/undo tests, and
  // reset the toggleFavorite-specific updateMany spy. The `as never`
  // is needed because prisma.card.findFirst has a strict Prisma type
  // with multiple overloads, while mockCardFindFirst is a plain
  // vi.fn() — there's no clean way to type the bridge.
  vi.mocked(prisma.card.findFirst).mockImplementation(
    mockCardFindFirst as never
  );
  mockUpdateMany.mockReset();
});

describe("answerCardAction", () => {
  it("returns { error: 未登录 } when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await answerCardAction(
      null,
      mkFd({ cardId: "c1", rating: "3", deckId: "d1" })
    );
    expect(res).toEqual({ error: "未登录" });
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("returns { error } when the card is not owned by the caller", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue(null);
    const res = await answerCardAction(
      null,
      mkFd({ cardId: "c1", rating: "3", deckId: "d1" })
    );
    expect(res).toEqual({ error: "卡片不存在或无权访问" });
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("happy path: returns { ok: true, newState: 10 fields, requeueInSession } and does NOT revalidate the study route", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1", deckId: "d1" });
    // answerCard now returns { state, progress, graduated, requeueInSession }
    // in one shot (same $transaction) — no separate progress read.
    mockAnswer.mockResolvedValue({
      state: FAKE_STATE,
      progress: 0.857,
      graduated: true,
      requeueInSession: false,
    });
    const res = await answerCardAction(
      null,
      mkFd({ cardId: "c1", rating: "3", deckId: "d1" })
    );
    expect(res?.ok).toBe(true);
    expect(res?.requeueInSession).toBe(false);
    expect(res?.newState).toEqual({
      stability: 1.234,
      difficulty: 5.6,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      state: "review",
      lastReview: "2026-06-07T10:00:00.000Z",
      due: "2026-06-08T10:00:00.000Z",
      progress: 0.857,
    });
    expect(mockAnswer).toHaveBeenCalledWith({
      cardId: "c1",
      rating: 3,
      userId: "u1",
    });
    // Intentionally NO revalidate: revalidating the force-dynamic /study
    // route mid-session re-renders it and unmounts the live client
    // session (wiping the in-session re-queue). The deck detail page is
    // dynamic and refreshes its progress on the next navigation.
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("Phase 8 (re-exec): passes through the strategy's progress + requeueInSession", async () => {
    // A still-learning card (progress below threshold) → the action
    // surfaces requeueInSession=true so the session re-tests it later.
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1", deckId: "d1" });
    mockAnswer.mockResolvedValue({
      state: { ...FAKE_STATE, state: "learning" },
      progress: 0,
      graduated: false,
      requeueInSession: true,
    });
    const res = await answerCardAction(
      null,
      mkFd({ cardId: "c1", rating: "3" })
    );
    expect(res?.newState?.progress).toBe(0);
    expect(res?.requeueInSession).toBe(true);
  });

  it("rejects rating=5 with fieldErrors (Zod min(1).max(4))", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await answerCardAction(
      null,
      mkFd({ cardId: "c1", rating: "5", deckId: "d1" })
    );
    expect(res?.fieldErrors).toBeDefined();
    expect(res?.fieldErrors?.rating).toMatch(/rating/);
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("rejects rating=abc (NaN) with fieldErrors", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await answerCardAction(
      null,
      mkFd({ cardId: "c1", rating: "abc", deckId: "d1" })
    );
    // Number("abc") === NaN, which z.number().int() rejects with
    // "Expected number, received nan". The exact wording is a Zod
    // internal — only assert the key exists.
    expect(res?.fieldErrors).toBeDefined();
    expect(res?.fieldErrors?.rating).toBeTypeOf("string");
    expect(res?.fieldErrors?.rating).not.toBe("");
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("propagates lib errors as { error } without throwing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1", deckId: "d1" });
    mockAnswer.mockRejectedValue(new Error("卡片不存在或无权访问"));
    const res = await answerCardAction(
      null,
      mkFd({ cardId: "c1", rating: "3", deckId: "d1" })
    );
    expect(res).toEqual({ error: "卡片不存在或无权访问" });
  });
});

describe("undoCardAction", () => {
  it("returns { error: 未登录 } when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await undoCardAction(null, mkFd({ cardId: "c1", deckId: "d1" }));
    expect(res).toEqual({ error: "未登录" });
    expect(mockRevert).not.toHaveBeenCalled();
  });

  it("happy path: returns { ok, restored: true, cardId } and revalidates", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1", deckId: "d1" });
    mockRevert.mockResolvedValue({ restored: true, cardId: "c1" });
    const res = await undoCardAction(null, mkFd({ cardId: "c1", deckId: "d1" }));
    expect(res).toEqual({ ok: true, restored: true, cardId: "c1" });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/decks/d1");
  });

  it("no-history branch: returns { ok, restored: false, cardId, reason }", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1", deckId: "d1" });
    mockRevert.mockResolvedValue({
      restored: false,
      cardId: "c1",
      reason: "no-history",
    });
    const res = await undoCardAction(null, mkFd({ cardId: "c1", deckId: "d1" }));
    expect(res).toEqual({
      ok: true,
      restored: false,
      cardId: "c1",
      reason: "no-history",
    });
  });
});

describe("toggleFavoriteStudyAction", () => {
  it("returns { error: 未登录 } when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await toggleFavoriteStudyAction(
      null,
      mkFd({ cardId: "c1" })
    );
    expect(res).toEqual({ error: "未登录" });
    expect(mockCardFindFirst).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects missing cardId with fieldErrors and no prisma call", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await toggleFavoriteStudyAction(null, mkFd({}));
    expect(res?.fieldErrors).toBeDefined();
    expect(res?.fieldErrors?.cardId).toBeTypeOf("string");
    expect(res?.fieldErrors?.cardId).not.toBe("");
    expect(mockCardFindFirst).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("returns { error: 卡片不存在或无权访问 } when the card is not owned", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // assertCardOwner -> findFirst returns null
    mockCardFindFirst.mockResolvedValue(null);
    const res = await toggleFavoriteStudyAction(
      null,
      mkFd({ cardId: "c1" })
    );
    expect(res).toEqual({ error: "卡片不存在或无权访问" });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("happy path: not-favorited → favorited (isFavorite: true)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // assertCardOwner -> { id, deckId } and the in-action findFirst
    // both see the same isFavorite=false card.
    mockCardFindFirst
      .mockResolvedValueOnce({ id: "c1", deckId: "d1" }) // assertCardOwner
      .mockResolvedValueOnce({ isFavorite: false }); // in-action read
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const res = await toggleFavoriteStudyAction(
      null,
      mkFd({ cardId: "c1" })
    );
    expect(res).toEqual({ ok: true, cardId: "c1", isFavorite: true });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/decks/d1");
  });

  it("happy path: already-favorited → unfavorited (isFavorite: false)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst
      .mockResolvedValueOnce({ id: "c1", deckId: "d1" })
      .mockResolvedValueOnce({ isFavorite: true });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const res = await toggleFavoriteStudyAction(
      null,
      mkFd({ cardId: "c1" })
    );
    expect(res).toEqual({ ok: true, cardId: "c1", isFavorite: false });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("race: first updateMany count=0, retry succeeds with fresh value", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // assertCardOwner, in-action read (false), then fresh re-read (true).
    mockCardFindFirst
      .mockResolvedValueOnce({ id: "c1", deckId: "d1" })
      .mockResolvedValueOnce({ isFavorite: false })
      .mockResolvedValueOnce({ isFavorite: true });
    mockUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // first write lost the race
      .mockResolvedValueOnce({ count: 1 }); // retry wins
    const res = await toggleFavoriteStudyAction(
      null,
      mkFd({ cardId: "c1" })
    );
    // fresh.isFavorite was true, so the retry flipped to false.
    expect(res).toEqual({ ok: true, cardId: "c1", isFavorite: false });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/decks/d1");
  });

  it("propagates prisma errors as { error } without throwing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst
      .mockResolvedValueOnce({ id: "c1", deckId: "d1" })
      .mockRejectedValueOnce(new Error("DB 挂了"));
    const res = await toggleFavoriteStudyAction(
      null,
      mkFd({ cardId: "c1" })
    );
    expect(res).toEqual({ error: "DB 挂了" });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
