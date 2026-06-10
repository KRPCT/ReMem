import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — declared before importing the actions module.
const mockAuth = vi.hoisted(() => vi.fn());
const mockDeckFindFirst = vi.hoisted(() => vi.fn());
const mockCardFindMany = vi.hoisted(() => vi.fn());
const mockCardStateDeleteMany = vi.hoisted(() => vi.fn());
const mockReviewLogDeleteMany = vi.hoisted(() => vi.fn());
const mockCardUpdateMany = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("../../../../auth", () => ({ auth: mockAuth }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: mockDeckFindFirst },
    card: { findMany: mockCardFindMany, updateMany: mockCardUpdateMany },
    cardState: { deleteMany: mockCardStateDeleteMany },
    reviewLog: { deleteMany: mockReviewLogDeleteMany },
    // Array form: resolve all queued ops, matching prisma.$transaction([...]).
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as () => unknown)(),
  },
}));

import { resetDeckProgressAction } from "./actions";

function mkFd(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("resetDeckProgressAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCardStateDeleteMany.mockResolvedValue({ count: 5 });
    mockReviewLogDeleteMany.mockResolvedValue({ count: 101 });
    mockCardUpdateMany.mockResolvedValue({ count: 5 });
  });

  it("returns 未登录 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await resetDeckProgressAction(null, mkFd({ id: "d1" }));
    expect(res).toEqual({ error: "未登录" });
    expect(mockCardStateDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 未找到牌组 when the deck is not owned by the user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue(null);
    const res = await resetDeckProgressAction(null, mkFd({ id: "d1" }));
    expect(res).toEqual({ error: "未找到牌组" });
    // Ownership where-clause includes userId (defense in depth).
    expect(mockDeckFindFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: "d1",
      userId: "u1",
    });
    expect(mockCardStateDeleteMany).not.toHaveBeenCalled();
  });

  it("clears CardState + ReviewLog, zeroes progress, and returns the count", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockCardFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);

    const res = await resetDeckProgressAction(null, mkFd({ id: "d1" }));

    expect(res).toEqual({ ok: true, resetCount: 5 });
    // CardState deleted by the deck's card ids.
    expect(mockCardStateDeleteMany).toHaveBeenCalledWith({
      where: { cardId: { in: ["c1", "c2"] } },
    });
    // ReviewLog cleared for the deck.
    expect(mockReviewLogDeleteMany).toHaveBeenCalledWith({
      where: { deckId: "d1" },
    });
    // Progress zeroed for the deck.
    expect(mockCardUpdateMany).toHaveBeenCalledWith({
      where: { deckId: "d1" },
      data: { progress: 0 },
    });
    // Deck detail/list/settings revalidated.
    expect(mockRevalidatePath).toHaveBeenCalledWith("/decks/d1");
  });

  it("is idempotent on an already-empty deck (no cards)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockCardFindMany.mockResolvedValue([]);
    mockCardUpdateMany.mockResolvedValue({ count: 0 });

    const res = await resetDeckProgressAction(null, mkFd({ id: "d1" }));
    expect(res).toEqual({ ok: true, resetCount: 0 });
    expect(mockCardStateDeleteMany).toHaveBeenCalledWith({
      where: { cardId: { in: [] } },
    });
  });
});
