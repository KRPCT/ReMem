import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockRevert = vi.hoisted(() => vi.fn());
const mockCardFindFirst = vi.hoisted(() => vi.fn());

vi.mock("../../../../../auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/fsrs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fsrs")>(
    "@/lib/fsrs"
  );
  return { ...actual, revertLastAnswer: mockRevert };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { card: { findFirst: mockCardFindFirst } },
}));

import { POST } from "./route";

function mkJsonRequest(body: unknown): Request {
  return new Request("http://x/api/study/undo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/study/undo", () => {
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
    expect(mockRevert).not.toHaveBeenCalled();
  });

  it("returns 404 when the card is not owned by the caller", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue(null);
    const res = await POST(mkJsonRequest({ cardId: "c1" }));
    expect(res.status).toBe(404);
    expect(mockRevert).not.toHaveBeenCalled();
  });

  it("happy path: returns 200 with { restored: true, cardId }", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1" });
    mockRevert.mockResolvedValue({ restored: true, cardId: "c1" });
    const res = await POST(mkJsonRequest({ cardId: "c1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { restored: boolean; cardId: string };
    expect(body).toEqual({ restored: true, cardId: "c1" });
    expect(mockRevert).toHaveBeenCalledWith({
      cardId: "c1",
      userId: "u1",
    });
  });

  it("no-history branch: returns 200 with { restored: false, reason }", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1" });
    mockRevert.mockResolvedValue({
      restored: false,
      cardId: "c1",
      reason: "no-history",
    });
    const res = await POST(mkJsonRequest({ cardId: "c1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      restored: boolean;
      cardId: string;
      reason?: string;
    };
    expect(body).toEqual({
      restored: false,
      cardId: "c1",
      reason: "no-history",
    });
  });

  it("returns 500 when the lib throws", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCardFindFirst.mockResolvedValue({ id: "c1" });
    mockRevert.mockRejectedValue(new Error("卡片不存在或无权访问"));
    const res = await POST(mkJsonRequest({ cardId: "c1" }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("卡片不存在或无权访问");
  });
});
