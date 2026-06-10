import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — declared before the actions module loads.
const mockAuth = vi.hoisted(() => vi.fn());
const mockDeckFindFirst = vi.hoisted(() => vi.fn());
const mockRecommend = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

vi.mock("../../../../../auth", () => ({ auth: mockAuth }));

// Mock the smart-recommend lib so the action's dynamic import
// resolves to a stub. The action does `await import(...)` because
// the lib is server-only and we want to keep the actions file's
// top-level imports lean.
vi.mock("@/lib/fsrs/smart-recommend", () => ({
  recommendStudyPlanForDeck: mockRecommend,
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

vi.mock("@/lib/prisma", () => ({
  prisma: { deck: { findFirst: mockDeckFindFirst } },
}));

import { prisma } from "@/lib/prisma";
import { recommendStudyPlanAction } from "./actions";

function mkFd(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const VALID_FD = mkFd({ deckId: "d1" });

const SAMPLE_RECOMMENDED = {
  newPerDay: 30,
  reviewsPerDay: 150,
  requestRetention: 0.9,
  enableFuzz: true,
  enableShortTerm: true,
  firstSessionTargetProgress: 0.8,
  source: "user-history-30d" as const,
  rationale: {
    newPerDay: "30 张/天 · 30 天历史中位数",
    reviewsPerDay: "150 张/天 · 30 天历史中位数",
    requestRetention: "ts-fsrs default_request_retention = 0.9",
    enableFuzz: "本项目覆盖 ts-fsrs 默认 (开 fuzz)",
    enableShortTerm: "ts-fsrs default_enable_short_term",
    firstSessionTargetProgress: "FSRS 6 经验值 0.80",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.deck.findFirst).mockImplementation(
    mockDeckFindFirst as never
  );
});

describe("recommendStudyPlanAction (Phase 08-04)", () => {
  it("returns { error: '未登录' } when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await recommendStudyPlanAction(null, VALID_FD);
    expect(res).toEqual({ error: "未登录" });
    expect(mockRecommend).not.toHaveBeenCalled();
  });

  it("returns { error: '未找到牌组' } when caller does not own the deck", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue(null);
    const res = await recommendStudyPlanAction(null, VALID_FD);
    expect(res).toEqual({ error: "未找到牌组" });
    expect(mockRecommend).not.toHaveBeenCalled();
  });

  it("happy path: returns 6-field values + source + rationale, does not write DB", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockRecommend.mockResolvedValue(SAMPLE_RECOMMENDED);

    const res = await recommendStudyPlanAction(null, VALID_FD);
    expect(res?.ok).toBe(true);
    expect(res?.values).toEqual(SAMPLE_RECOMMENDED);
    // Does not call upsert or revalidate — the action is
    // suggestion-only, the user still has to hit "保存".
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
