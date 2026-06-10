import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockAnswer = vi.hoisted(() => vi.fn());
const mockCardFindFirst = vi.hoisted(() => vi.fn());

vi.mock("../../../../../auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/fsrs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fsrs")>(
    "@/lib/fsrs"
  );
  return { ...actual, answerCard: mockAnswer };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { card: { findFirst: mockCardFindFirst } },
}));

import { POST } from "./route";

function mkJsonRequest(body: unknown): Request {
  return new Request("http://x/api/study/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
});

describe("POST /api/study/answer", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(mkJsonRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty body (Zod fails)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(mkJsonRequest({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors?: Record<string, string[]> };
    expect(body.fieldErrors).toBeDefined();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("returns 400 for rating out of range (5)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(mkJsonRequest({ cardId: "c1", rating: 5 }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors?: Record<string, string[]> };
    expect(body.fieldErrors?.rating).toBeDefined();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("returns 404 when the card is not owned by the caller", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue(null);
    const res = await POST(mkJsonRequest({ cardId: "c1", rating: 3 }));
    expect(res.status).toBe(404);
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("happy path: returns 200 with 9-field state projection", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1" });
    // answerCard now returns { state, progress, graduated, requeueInSession };
    // the route projects `.state`.
    mockAnswer.mockResolvedValue({
      state: FAKE_STATE,
      progress: 1.0,
      graduated: true,
      requeueInSession: false,
    });
    const res = await POST(mkJsonRequest({ cardId: "c1", rating: 3 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: Record<string, unknown> };
    expect(body.state).toEqual({
      stability: 1.234,
      difficulty: 5.6,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      state: "review",
      lastReview: "2026-06-07T10:00:00.000Z",
      due: "2026-06-08T10:00:00.000Z",
    });
    expect(mockAnswer).toHaveBeenCalledWith({
      cardId: "c1",
      rating: 3,
      userId: "u1",
    });
  });

  it("returns 500 when the lib throws", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1" });
    mockAnswer.mockRejectedValue(new Error("卡片不存在或无权访问"));
    const res = await POST(mkJsonRequest({ cardId: "c1", rating: 3 }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("卡片不存在或无权访问");
  });
});
