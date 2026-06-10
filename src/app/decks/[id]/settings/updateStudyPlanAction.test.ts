import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — must be declared before importing the actions module.
const mockAuth = vi.hoisted(() => vi.fn());
const mockStudyPlanUpsert = vi.hoisted(() => vi.fn());
const mockDeckFindFirst = vi.hoisted(() => vi.fn());
const mockCardFindMany = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockBuildQueue = vi.hoisted(() => vi.fn());

// Mock next-auth and next/cache to avoid the next-auth env.js -> next/server
// CJS import chain that fails in the jsdom test environment. The
// actions module only references `AuthError` (not used by the study
// plan path), so a stub class is enough.
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

vi.mock("../../../../../auth", () => ({ auth: mockAuth }));

// Mock the fsrs lib so we can stub buildQueue to return canned
// counts. STUDY_PLAN_DEFAULTS is preserved from the actual module
// so the preview-fallback path stays realistic.
vi.mock("@/lib/fsrs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fsrs")>(
    "@/lib/fsrs"
  );
  return {
    ...actual,
    buildQueue: mockBuildQueue,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: vi.fn() },
    studyPlan: { upsert: vi.fn() },
    card: { findMany: vi.fn() },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        studyPlan: { upsert: mockStudyPlanUpsert },
      }),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  updateStudyPlanAction,
  previewStudyPlanAction,
} from "./actions";

function mkFd(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const VALID_FD = mkFd({
  deckId: "d1",
  newPerDay: "20",
  reviewsPerDay: "200",
  requestRetention: "0.9",
  enableFuzz: "true",
  enableShortTerm: "true",
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-bind the hoisted findFirst / upsert / findMany spies. The
  // `as never` bridges the strict Prisma typed methods to plain
  // vi.fn() — there's no clean way to type the union.
  vi.mocked(prisma.deck.findFirst).mockImplementation(
    mockDeckFindFirst as never
  );
  vi.mocked(prisma.studyPlan.upsert).mockImplementation(
    mockStudyPlanUpsert as never
  );
  vi.mocked(prisma.card.findMany).mockImplementation(
    mockCardFindMany as never
  );
});

describe("updateStudyPlanAction (Phase 08-01)", () => {
  it("returns { error: '未登录' } when no session and does not upsert", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updateStudyPlanAction(null, VALID_FD);
    expect(res).toEqual({ error: "未登录" });
    expect(mockStudyPlanUpsert).not.toHaveBeenCalled();
  });

  it("returns { error: '未找到牌组' } when caller does not own the deck", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue(null);
    const res = await updateStudyPlanAction(null, VALID_FD);
    expect(res).toEqual({ error: "未找到牌组" });
    expect(mockStudyPlanUpsert).not.toHaveBeenCalled();
  });

  it("returns { fieldErrors } on schema failure and does not upsert", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    // requestRetention > 0.97 fails the bound
    const fd = mkFd({
      deckId: "d1",
      newPerDay: "20",
      reviewsPerDay: "200",
      requestRetention: "0.99",
      enableFuzz: "true",
      enableShortTerm: "true",
    });
    const res = await updateStudyPlanAction(null, fd);
    expect(res?.fieldErrors?.requestRetention).toBeDefined();
    expect(mockStudyPlanUpsert).not.toHaveBeenCalled();
  });

  it("happy path: upserts and revalidates both settings and deck detail", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockStudyPlanUpsert.mockResolvedValue({ id: "sp1" });
    const res = await updateStudyPlanAction(null, VALID_FD);
    expect(res).toEqual({ ok: true });
    expect(mockStudyPlanUpsert).toHaveBeenCalledTimes(1);
    // 5 fields all round-trip through to the upsert payload
    const upsertArg = mockStudyPlanUpsert.mock.calls[0]?.[0];
    expect(upsertArg).toMatchObject({
      where: { deckId: "d1" },
      create: {
        deckId: "d1",
        userId: "u1",
        newPerDay: 20,
        reviewsPerDay: 200,
        requestRetention: 0.9,
        enableFuzz: true,
        enableShortTerm: true,
      },
      update: {
        newPerDay: 20,
        reviewsPerDay: 200,
        requestRetention: 0.9,
        enableFuzz: true,
        enableShortTerm: true,
      },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/decks/d1/settings");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/decks/d1");
  });
});

describe("previewStudyPlanAction (Phase 08-01)", () => {
  it("returns counts from buildQueue on happy path", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockDeckFindFirst.mockResolvedValue({ id: "d1" });
    mockCardFindMany.mockResolvedValue([]);
    mockBuildQueue.mockReturnValue({
      queue: [{ cardId: "c1" }],
      newCount: 1,
      reviewCount: 0,
      learnCount: 0,
      caps: { new: 20, reviews: 200 },
      favoritesCount: 0,
    });
    const res = await previewStudyPlanAction(null, VALID_FD);
    expect(res).toEqual({
      ok: true,
      total: 1,
      newCount: 1,
      reviewCount: 0,
      learnCount: 0,
    });
    // Phase 08-04 hotfix: buildQueue now receives the full
    // StudyPlanShape, including firstSessionTargetProgress. The
    // default value (0.8) flows through from the parsed Zod
    // schema (studyPlanSchema).
    expect(mockBuildQueue).toHaveBeenCalledWith(
      [],
      {
        newPerDay: 20,
        reviewsPerDay: 200,
        firstSessionTargetProgress: 0.8,
      },
      expect.any(Date)
    );
  });

  it("returns { error: '未登录' } when no session and does not call buildQueue", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await previewStudyPlanAction(null, VALID_FD);
    expect(res?.error).toBe("未登录");
    expect(res?.total).toBe(0);
    expect(mockBuildQueue).not.toHaveBeenCalled();
  });
});
