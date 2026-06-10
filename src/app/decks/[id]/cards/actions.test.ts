import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";

// Mock next-auth and next/cache to avoid the next-auth env.js -> next/server
// CJS import chain that fails in the jsdom test environment.
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { __isRedirect: boolean }).__isRedirect = true;
    throw err;
  }),
}));

// Mock auth at the file level so createCardAction / updateCardAction
// can be invoked with a controlled session.
vi.mock("../../../../../auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  createCardAction,
  deleteCardAction,
  toggleFavoriteAction,
  toggleSuspendedAction,
  batchDeleteCardsAction,
  batchToggleFavoriteAction,
  batchToggleSuspendAction,
} from "./actions";
import { auth } from "../../../../../auth";

const TEST_USER_ID = "test-user-04-02-actions";
const TEST_DECK_ID = "test-deck-04-02-actions";

async function ensureUser() {
  const user = await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    create: {
      id: TEST_USER_ID,
      email: "test-04-02-actions@example.com",
      passwordHash: "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali",
    },
    update: {},
  });
  return user;
}

beforeAll(async () => {
  await ensureUser();
  // Create a deck + noteType + 2 fields for the integration test fixture.
  await prisma.deck.upsert({
    where: { id: TEST_DECK_ID },
    create: {
      id: TEST_DECK_ID,
      userId: TEST_USER_ID,
      title: "Test Deck 04-02",
      noteType: {
        create: {
          userId: TEST_USER_ID,
          name: "Test NT",
          fields: {
            create: [
              { name: "Front", ord: 0 },
              { name: "Back", ord: 1 },
            ],
          },
        },
      },
    },
    update: {},
  });
});

afterAll(async () => {
  // Cascade: deleting the deck also removes cards + CardFields.
  await prisma.deck.deleteMany({ where: { id: TEST_DECK_ID, userId: TEST_USER_ID } });
  await prisma.deck.deleteMany({ where: { id: OTHER_DECK_ID, userId: OTHER_USER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.user.deleteMany({ where: { id: OTHER_USER_ID } });
});

beforeEach(async () => {
  await prisma.card.deleteMany({ where: { deckId: TEST_DECK_ID } });
});

function makeFormData(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("deckId", TEST_DECK_ID);
  fd.set("frontContent", extra.frontContent ?? "**bold** front");
  fd.set("backContent", extra.backContent ?? "back content");
  fd.set("typeData", extra.typeData ?? JSON.stringify({ type: "qa" }));
  fd.set("fields", extra.fields ?? "{}");
  fd.set("isFavorite", extra.isFavorite ?? "false");
  fd.set("suspended", extra.suspended ?? "false");
  return fd;
}

describe("createCardAction", () => {
  it("returns { error: '未登录' } when not authenticated", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await createCardAction(null, makeFormData());
    expect(result?.error).toBe("未登录");
  });

  it("rejects a different user's deck (ownership)", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "different-user-id" },
    });
    const result = await createCardAction(null, makeFormData());
    expect(result?.error).toMatch(/未找到/);
    // No card was created.
    const count = await prisma.card.count({ where: { deckId: TEST_DECK_ID } });
    expect(count).toBe(0);
  });

  it("rejects malformed typeData JSON", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const result = await createCardAction(
      null,
      makeFormData({ typeData: "not json" })
    );
    expect(result?.error).toMatch(/JSON/);
  });

  it("rejects unknown typeData.type (discriminated union)", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const result = await createCardAction(
      null,
      makeFormData({ typeData: JSON.stringify({ type: "nope" }) })
    );
    expect(result?.fieldErrors).toBeDefined();
  });
});

// ─── 04-03: toggle + delete Server Actions ─────────────────────────

const OTHER_USER_ID = "test-user-04-03-other";
const OTHER_DECK_ID = "test-deck-04-03-other";
const OTHER_CARD_ID = "test-card-04-03-other";

async function ensureOtherUser() {
  await prisma.user.upsert({
    where: { id: OTHER_USER_ID },
    create: {
      id: OTHER_USER_ID,
      email: "test-04-03-other@example.com",
      passwordHash:
        "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali",
    },
    update: {},
  });
  await prisma.deck.upsert({
    where: { id: OTHER_DECK_ID },
    create: {
      id: OTHER_DECK_ID,
      userId: OTHER_USER_ID,
      title: "Other Test Deck",
    },
    update: {},
  });
  await prisma.card.upsert({
    where: { id: OTHER_CARD_ID },
    create: {
      id: OTHER_CARD_ID,
      deckId: OTHER_DECK_ID,
      type: "qa",
    },
    update: {},
  });
}

describe("toggleFavoriteAction", () => {
  it("flips isFavorite on the card", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const card = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa" },
    });
    try {
      await toggleFavoriteAction(card.id, TEST_DECK_ID);
      const after1 = await prisma.card.findUnique({ where: { id: card.id } });
      expect(after1?.isFavorite).toBe(true);
      await toggleFavoriteAction(card.id, TEST_DECK_ID);
      const after2 = await prisma.card.findUnique({ where: { id: card.id } });
      expect(after2?.isFavorite).toBe(false);
    } finally {
      await prisma.card.deleteMany({ where: { id: card.id } });
    }
  });

  it("rejects when not authenticated", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      toggleFavoriteAction("any-id", TEST_DECK_ID)
    ).rejects.toThrow("未登录");
  });

  it("rejects when the card belongs to a different user", async () => {
    await ensureOtherUser();
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    await expect(
      toggleFavoriteAction(OTHER_CARD_ID, OTHER_DECK_ID)
    ).rejects.toThrow("未找到卡片");
    // The other user's card is untouched.
    const after = await prisma.card.findUnique({
      where: { id: OTHER_CARD_ID },
    });
    expect(after?.isFavorite).toBe(false);
  });

  it("retries once on a concurrent flip (WR-04 race fix)", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    // Card starts as isFavorite=true. We make the first updateMany
    // simulate a concurrent flip (count=0) and the second (retry)
    // succeed (count=1). The retry path should re-read the value
    // (still true, since the race was simulated — no other writer
    // actually changed it) and flip it to false.
    //
    // We install the mock with Object.defineProperty (NOT vi.spyOn —
    // Prisma's delegate property descriptor doesn't survive vi.spyOn's
    // mockRestore cleanly across tests in this file). Save the
    // original method, swap in a controlled stub, and restore exactly
    // what we found in finally.
    const card = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa", isFavorite: true },
    });
    const originalUpdateMany = prisma.card.updateMany;
    let firstCall = true;
    const mockedUpdateMany = ((...args: unknown[]) => {
      const arg = args[0] as { where: { isFavorite?: boolean } };
      if (firstCall && arg.where.isFavorite === true) {
        // Simulate the race: another request flipped the value
        // between our read and our write. The conditional update
        // with the stale value returns count=0.
        firstCall = false;
        return Promise.resolve({ count: 0 });
      }
      // Subsequent calls (including the retry): defer to the real
      // Prisma method so the actual DB state is observed.
      return (
        originalUpdateMany as unknown as (...a: unknown[]) => Promise<unknown>
      )(...args);
    }) as unknown as typeof originalUpdateMany;
    Object.defineProperty(prisma.card, "updateMany", {
      value: mockedUpdateMany,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    try {
      await toggleFavoriteAction(card.id, TEST_DECK_ID);
      // After retry: the value was flipped (true → false). The first
      // conditional update returned count=0 (race simulated); the
      // retry re-read true and flipped to false.
      const after = await prisma.card.findUnique({ where: { id: card.id } });
      expect(after?.isFavorite).toBe(false);
    } finally {
      Object.defineProperty(prisma.card, "updateMany", {
        value: originalUpdateMany,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      await prisma.card.deleteMany({ where: { id: card.id } });
    }
  });
});

describe("toggleSuspendedAction", () => {
  it("flips suspended on the card", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const card = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa" },
    });
    try {
      await toggleSuspendedAction(card.id, TEST_DECK_ID);
      const after1 = await prisma.card.findUnique({ where: { id: card.id } });
      expect(after1?.suspended).toBe(true);
      await toggleSuspendedAction(card.id, TEST_DECK_ID);
      const after2 = await prisma.card.findUnique({ where: { id: card.id } });
      expect(after2?.suspended).toBe(false);
    } finally {
      await prisma.card.deleteMany({ where: { id: card.id } });
    }
  });

  it("the card is excluded from a { suspended: false } queue query when suspended", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const card = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa" },
    });
    try {
      await toggleSuspendedAction(card.id, TEST_DECK_ID);
      const queue = await prisma.card.findMany({
        where: { deckId: TEST_DECK_ID, suspended: false },
      });
      expect(queue.find((c) => c.id === card.id)).toBeUndefined();
    } finally {
      await prisma.card.deleteMany({ where: { id: card.id } });
    }
  });

  it("rejects when not authenticated", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      toggleSuspendedAction("any-id", TEST_DECK_ID)
    ).rejects.toThrow("未登录");
  });
});

// ─── 04-05 Item 7b: batch card actions ─────────────────────────

describe("batchDeleteCardsAction", () => {
  it("rejects when not authenticated", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      batchDeleteCardsAction(["any"], TEST_DECK_ID)
    ).rejects.toThrow("未登录");
  });

  it("rejects an empty cardIds array", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    await expect(
      batchDeleteCardsAction([], TEST_DECK_ID)
    ).rejects.toThrow("未选择任何卡片");
  });

  it("rejects when any cardId is from a different user's deck", async () => {
    await ensureOtherUser();
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    // OTHER_CARD_ID is owned by OTHER_USER, not TEST_USER.
    await expect(
      batchDeleteCardsAction([OTHER_CARD_ID], TEST_DECK_ID)
    ).rejects.toThrow("卡片所有权校验失败");
    // The other user's card is untouched.
    const after = await prisma.card.findUnique({
      where: { id: OTHER_CARD_ID },
    });
    expect(after).not.toBeNull();
  });

  it("deletes all cards in the batch and revalidates", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const a = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa" },
    });
    const b = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "fill", typeData: { answers: ["x"] } },
    });
    try {
      await batchDeleteCardsAction([a.id, b.id], TEST_DECK_ID);
      const after = await prisma.card.findMany({
        where: { id: { in: [a.id, b.id] } },
      });
      expect(after).toHaveLength(0);
    } finally {
      await prisma.card.deleteMany({ where: { deckId: TEST_DECK_ID } });
    }
  });
});

describe("batchToggleFavoriteAction", () => {
  it("flips isFavorite on all cards in the batch", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const a = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa", isFavorite: false },
    });
    const b = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa", isFavorite: true },
    });
    try {
      await batchToggleFavoriteAction([a.id, b.id], TEST_DECK_ID, true);
      const afterA = await prisma.card.findUnique({ where: { id: a.id } });
      const afterB = await prisma.card.findUnique({ where: { id: b.id } });
      expect(afterA?.isFavorite).toBe(true);
      expect(afterB?.isFavorite).toBe(true);

      await batchToggleFavoriteAction([a.id, b.id], TEST_DECK_ID, false);
      const afterA2 = await prisma.card.findUnique({ where: { id: a.id } });
      const afterB2 = await prisma.card.findUnique({ where: { id: b.id } });
      expect(afterA2?.isFavorite).toBe(false);
      expect(afterB2?.isFavorite).toBe(false);
    } finally {
      await prisma.card.deleteMany({ where: { deckId: TEST_DECK_ID } });
    }
  });

  it("rejects when not authenticated", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      batchToggleFavoriteAction(["any"], TEST_DECK_ID, true)
    ).rejects.toThrow("未登录");
  });
});

describe("batchToggleSuspendAction", () => {
  it("flips suspended on all cards in the batch", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const a = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa", suspended: false },
    });
    const b = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa", suspended: false },
    });
    try {
      await batchToggleSuspendAction([a.id, b.id], TEST_DECK_ID, true);
      const after = await prisma.card.findMany({
        where: { id: { in: [a.id, b.id] } },
      });
      expect(after.every((c) => c.suspended === true)).toBe(true);
    } finally {
      await prisma.card.deleteMany({ where: { deckId: TEST_DECK_ID } });
    }
  });

  it("rejects an empty batch", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    await expect(
      batchToggleSuspendAction([], TEST_DECK_ID, true)
    ).rejects.toThrow("未选择任何卡片");
  });
});

async function makeDeleteFormData(
  cardId: string,
  deckId: string
): Promise<FormData> {
  const fd = new FormData();
  fd.set("cardId", cardId);
  fd.set("deckId", deckId);
  return fd;
}

describe("deleteCardAction", () => {
  it("removes the card and cascades to CardField", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const card = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa" },
    });
    // Link a CardField to one of the test NoteType's fields.
    const field = await prisma.field.findFirst({
      where: { noteType: { deckId: TEST_DECK_ID } },
    });
    if (field) {
      await prisma.cardField.create({
        data: { cardId: card.id, fieldId: field.id, value: "x" },
      });
    }

    try {
      // deleteCardAction no longer redirects (04-06 Bug 6) — it just
      // resolves after the cascade delete completes. The caller (dialog
      // / row menu) does router.refresh / router.push instead.
      await expect(
        deleteCardAction(await makeDeleteFormData(card.id, TEST_DECK_ID))
      ).resolves.toBeUndefined();

      const after = await prisma.card.findUnique({ where: { id: card.id } });
      expect(after).toBeNull();
      const fields = await prisma.cardField.count({ where: { cardId: card.id } });
      expect(fields).toBe(0);
      const state = await prisma.cardState.count({ where: { cardId: card.id } });
      expect(state).toBe(0);
    } finally {
      await prisma.card.deleteMany({ where: { id: card.id } });
    }
  });

  it("rejects when not authenticated", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      deleteCardAction(await makeDeleteFormData("any-id", TEST_DECK_ID))
    ).rejects.toThrow("未登录");
  });

  it("leaves the other user's card untouched (ownership REJECTS silently)", async () => {
    await ensureOtherUser();
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    // deleteMany on a compound where that doesn't match returns count=0
    // and the function resolves normally (no redirect since 04-06 Bug 6).
    await expect(
      deleteCardAction(await makeDeleteFormData(OTHER_CARD_ID, OTHER_DECK_ID))
    ).resolves.toBeUndefined();
    // The other user's card is still there.
    const after = await prisma.card.findUnique({
      where: { id: OTHER_CARD_ID },
    });
    expect(after).not.toBeNull();
  });

  it("is idempotent — calling delete twice is fine", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    const card = await prisma.card.create({
      data: { deckId: TEST_DECK_ID, type: "qa" },
    });
    try {
      await expect(
        deleteCardAction(await makeDeleteFormData(card.id, TEST_DECK_ID))
      ).resolves.toBeUndefined();
      // Second call: row is already gone, deleteMany returns count=0,
      // the function still resolves (idempotent, no redirect).
      await expect(
        deleteCardAction(await makeDeleteFormData(card.id, TEST_DECK_ID))
      ).resolves.toBeUndefined();
    } finally {
      await prisma.card.deleteMany({ where: { id: card.id } });
    }
  });
});

describe("full CRUD lifecycle", () => {
  it("create → read → toggle favorite → delete round-trips", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID },
    });
    // CREATE — createCardAction redirects after writing; we just
    // let the redirect throw and look up the card that was written.
    try {
      await createCardAction(
        null,
        makeFormData({ typeData: JSON.stringify({ type: "qa" }) })
      );
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT:")) {
        throw e;
      }
    }

    const card = await prisma.card.findFirst({
      where: { deckId: TEST_DECK_ID },
      orderBy: { createdAt: "desc" },
    });
    expect(card).not.toBeNull();
    if (!card) return;

    try {
      // READ back
      const read1 = await prisma.card.findUnique({ where: { id: card.id } });
      expect(read1?.type).toBe("qa");
      expect(read1?.frontContent).toBe("**bold** front");

      // TOGGLE favorite
      await toggleFavoriteAction(card.id, TEST_DECK_ID);
      const read2 = await prisma.card.findUnique({ where: { id: card.id } });
      expect(read2?.isFavorite).toBe(true);

      // DELETE — no longer redirects (04-06 Bug 6).
      await deleteCardAction(await makeDeleteFormData(card.id, TEST_DECK_ID));
      const gone = await prisma.card.findUnique({ where: { id: card.id } });
      expect(gone).toBeNull();
    } finally {
      await prisma.card.deleteMany({ where: { id: card.id } });
    }
  });
});
