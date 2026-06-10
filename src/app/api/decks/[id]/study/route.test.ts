import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — these run before the route module is imported.
const mockAuth = vi.hoisted(() => vi.fn());
const mockDeckFindFirst = vi.hoisted(() => vi.fn());
const mockCardFindMany = vi.hoisted(() => vi.fn());
const mockPlanFindUnique = vi.hoisted(() => vi.fn());

vi.mock("../../../../../../auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: mockDeckFindFirst },
    card: { findMany: mockCardFindMany },
    studyPlan: { findUnique: mockPlanFindUnique },
  },
}));

import { GET } from "./route";

function mkParams(deckId: string): Promise<{ id: string }> {
  return Promise.resolve({ id: deckId });
}

function mkRequest(): Request {
  return new Request("http://x/api/decks/d1/study");
}

beforeEach(() => {
  mockAuth.mockReset();
  mockDeckFindFirst.mockReset();
  mockCardFindMany.mockReset();
  mockPlanFindUnique.mockReset();
});

describe("GET /api/decks/[id]/study", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(mkRequest(), { params: mkParams("d1") });
    expect(res.status).toBe(401);
    expect(mockDeckFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck is owned by another user (or missing)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue(null);
    const res = await GET(mkRequest(), { params: mkParams("d1") });
    expect(res.status).toBe(404);
    // No card / plan lookups after ownership fails.
    expect(mockCardFindMany).not.toHaveBeenCalled();
    expect(mockPlanFindUnique).not.toHaveBeenCalled();
  });

  it("returns an empty queue with default caps when deck has no cards and no plan", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockCardFindMany.mockResolvedValue([]);
    mockPlanFindUnique.mockResolvedValue(null);
    const res = await GET(mkRequest(), { params: mkParams("d1") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.deckId).toBe("d1");
    expect(body.queue).toEqual([]);
    expect(body.newCount).toBe(0);
    expect(body.learnCount).toBe(0);
    expect(body.reviewCount).toBe(0);
    expect(body.caps).toEqual({ new: 20, reviews: 200 });
    expect(body.tz).toBe("server");
  });

  it("returns 3 new cards in the queue when the deck has 3 unreviewed cards and no plan", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockPlanFindUnique.mockResolvedValue(null);
    const now = new Date("2026-06-07T12:00:00Z");
    const created = new Date("2026-06-01T00:00:00Z");
    mockCardFindMany.mockResolvedValue([
      { id: "a", deckId: "d1", cardState: null, createdAt: created, suspended: false },
      { id: "b", deckId: "d1", cardState: null, createdAt: created, suspended: false },
      { id: "c", deckId: "d1", cardState: null, createdAt: created, suspended: false },
    ]);
    const res = await GET(mkRequest(), { params: mkParams("d1") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      newCount: number;
      queue: Array<{ fsrs: { state: string } }>;
    };
    expect(body.newCount).toBe(3);
    expect(body.queue).toHaveLength(3);
    for (const item of body.queue) {
      expect(item.fsrs.state).toBe("new");
    }
    // Suppress unused-now warning — kept to document the reference clock.
    void now;
  });

  it("uses the StudyPlan caps when present", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockCardFindMany.mockResolvedValue([]);
    mockPlanFindUnique.mockResolvedValue({ newPerDay: 5, reviewsPerDay: 10 });
    const res = await GET(mkRequest(), { params: mkParams("d1") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { caps: { new: number; reviews: number } };
    expect(body.caps).toEqual({ new: 5, reviews: 10 });
  });

  it("returns 404 for a deck that does not belong to the calling user (simulated)", async () => {
    // The handler relies on the prisma where clause to enforce
    // ownership — the where is `{ id: deckId, userId: session.user.id }`,
    // so a foreign deck produces `null` and we return 404 (not 403),
    // avoiding existence leaks.
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue(null);
    const res = await GET(mkRequest(), { params: mkParams("attacker-deck") });
    expect(res.status).toBe(404);
  });

  // ── Phase 08-01 round-trip regression ─────────────────────────
  // After the user saves a new StudyPlan via
  // updateStudyPlanAction, GET /api/decks/[id]/study must
  // immediately reflect the new caps. The test does NOT call the
  // server action directly (that needs the React form-action
  // wrapper, not in scope for vitest) — instead it stages a fresh
  // StudyPlan row in the mock and asserts the GET route reads it.

  it("Phase 08-01 round-trip: StudyPlan caps persisted, GET immediately returns new cap", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockCardFindMany.mockResolvedValue([]);
    // Simulate "user just saved a plan with newPerDay=5, reviewsPerDay=10".
    // requestRetention / enableFuzz / enableShortTerm are also on the
    // row now (Phase 8 schema change) — we include them so the type
    // check on the mock shape matches the real StudyPlan row.
    mockPlanFindUnique.mockResolvedValue({
      newPerDay: 5,
      reviewsPerDay: 10,
      requestRetention: 0.85,
      enableFuzz: true,
      enableShortTerm: true,
    });
    const res = await GET(mkRequest(), { params: mkParams("d1") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      caps: { new: number; reviews: number };
    };
    expect(body.caps).toEqual({ new: 5, reviews: 10 });
  });

  it("Phase 08-01: StudyPlan row contains requestRetention but GET caps unchanged", async () => {
    // Confirms that buildQueue's signature still only consumes
    // newPerDay + reviewsPerDay (the other 3 Phase 8 columns are
    // stored but not yet threaded into the FSRS scheduler — that's
    // Phase 9+ work). tz=server stays the same so we know the
    // route's response shape didn't drift.
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockCardFindMany.mockResolvedValue([]);
    mockPlanFindUnique.mockResolvedValue({
      newPerDay: 7,
      reviewsPerDay: 14,
      requestRetention: 0.9,
      enableFuzz: true,
      enableShortTerm: true,
    });
    const res = await GET(mkRequest(), { params: mkParams("d1") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      caps: { new: number; reviews: number };
      tz: string;
    };
    expect(body.caps).toEqual({ new: 7, reviews: 14 });
    expect(body.tz).toBe("server");
  });
});
