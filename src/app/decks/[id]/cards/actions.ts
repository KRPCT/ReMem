"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AuthError } from "next-auth";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { cardCreateSchema, cardUpdateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export type CardActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

type DeckWithNoteType = Prisma.DeckGetPayload<{
  include: {
    noteType: {
      include: { fields: true };
    };
  };
}>;

async function assertDeckOwner(
  deckId: string,
  userId: string
): Promise<DeckWithNoteType> {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: {
      noteType: {
        include: { fields: { orderBy: { ord: "asc" } } },
      },
    },
  });
  if (!deck?.noteType) {
    throw new Error("未找到牌组或模板未初始化");
  }
  return deck;
}

/**
 * Upsert one CardField row per NoteType field. Empty values map clears the
 * field (set to ""). The `@@unique([cardId, fieldId])` constraint is the
 * upsert key — this preserves `CardField.id` continuity across updates.
 *
 * Defense against silent data loss: an empty submission on update means the
 * edit page's 笔记 section never rendered (e.g. Prisma include misconfigured).
 * We no-op instead of wiping existing CardField rows to value="".
 */
async function syncCardFields(
  tx: Prisma.TransactionClient,
  cardId: string,
  fieldIdByName: Map<string, string>,
  values: Record<string, string>
): Promise<void> {
  if (Object.keys(values).length === 0) return;
  for (const [name, fieldId] of fieldIdByName) {
    const value = values[name] ?? "";
    await tx.cardField.upsert({
      where: { cardId_fieldId: { cardId, fieldId } },
      create: { cardId, fieldId, value },
      update: { value },
    });
  }
}

function readString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Phase 04-05 Item 6: per-card `shuffle` is gone from the UI. The
 * source of truth is `Deck.shuffleOptions`. We persist the value
 * in `Card.typeData.shuffle` (for backwards compat with existing rows
 * and the future study engine), but the value is forced from the
 * deck on every create / update.
 *
 * Phase 04-06 Feature A: per-card `Card.shuffleOptOut` is an
 * additional veto — even if the deck shuffles, an opted-out card
 * does not. For types that don't have a `shuffle` field (qa, fill,
 * judge) the override is a no-op.
 */
function effectiveShuffle(deckShuffle: boolean, cardOptOut: boolean): boolean {
  return deckShuffle && !cardOptOut;
}

function overrideShuffle(
  typeData: import("@/lib/validation").CardTypeData,
  deckShuffle: boolean,
  cardShuffleOptOut: boolean
): import("@/lib/validation").CardTypeData {
  if (typeData.type === "choice" || typeData.type === "multi_choice") {
    return {
      ...typeData,
      shuffle: effectiveShuffle(deckShuffle, cardShuffleOptOut),
    };
  }
  return typeData;
}

export async function createCardAction(
  _prev: CardActionState,
  fd: FormData
): Promise<CardActionState> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    const deckId = readString(fd, "deckId");
    const frontContent = readString(fd, "frontContent");
    const backContent = readString(fd, "backContent");
    const typeDataRaw = readString(fd, "typeData") || "{}";
    const fieldsRaw = readString(fd, "fields") || "{}";
    const isFavorite = fd.get("isFavorite") === "true";
    const suspended = fd.get("suspended") === "true";
    const shuffleOptOut = fd.get("shuffleOptOut") === "true";

    let typeData: unknown;
    let fieldsInput: unknown;
    try {
      typeData = JSON.parse(typeDataRaw);
    } catch {
      return { error: "typeData JSON 损坏" };
    }
    try {
      fieldsInput = JSON.parse(fieldsRaw);
    } catch {
      return { error: "fields JSON 损坏" };
    }

    const parsed = cardCreateSchema.safeParse({
      deckId,
      frontContent,
      backContent,
      typeData,
      fields: fieldsInput,
      isFavorite,
      suspended,
      shuffleOptOut,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return { fieldErrors };
    }

    let deck: DeckWithNoteType;
    try {
      deck = await assertDeckOwner(parsed.data.deckId, session.user.id);
    } catch {
      return { error: "未找到牌组" };
    }
    const fieldIdByName = new Map(
      deck.noteType!.fields.map((f) => [f.name, f.id])
    );

    const created = await prisma.$transaction(async (tx) => {
      // Phase 04-05 Item 6 + 04-06 Feature A: override the per-card
      // shuffle field with the deck-level setting AND the per-card
      // opt-out flag. For non-choice / non-multi_choice types this is
      // a no-op (no `shuffle` key in typeData).
      const typeDataWithShuffle = overrideShuffle(
        parsed.data.typeData,
        deck.shuffleOptions,
        parsed.data.shuffleOptOut
      );
      const card = await tx.card.create({
        data: {
          deckId: deck.id,
          type: parsed.data.typeData.type,
          frontContent: parsed.data.frontContent,
          backContent: parsed.data.backContent,
          typeData: typeDataWithShuffle as Prisma.InputJsonValue,
          isFavorite: parsed.data.isFavorite,
          suspended: parsed.data.suspended,
          shuffleOptOut: parsed.data.shuffleOptOut,
        },
      });
      await syncCardFields(tx, card.id, fieldIdByName, parsed.data.fields);
      return card;
    });

    revalidatePath(`/decks/${deck.id}`);
    redirect(`/decks/${deck.id}/cards/${created.id}`);
    return null;
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

export async function updateCardAction(
  _prev: CardActionState,
  fd: FormData
): Promise<CardActionState> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    const id = readString(fd, "id");
    const deckId = readString(fd, "deckId");
    const frontContent = readString(fd, "frontContent");
    const backContent = readString(fd, "backContent");
    const typeDataRaw = readString(fd, "typeData") || "{}";
    const fieldsRaw = readString(fd, "fields") || "{}";
    const isFavorite = fd.get("isFavorite") === "true";
    const suspended = fd.get("suspended") === "true";
    const shuffleOptOut = fd.get("shuffleOptOut") === "true";

    if (!id) return { error: "缺少卡片 id" };

    let typeData: unknown;
    let fieldsInput: unknown;
    try {
      typeData = JSON.parse(typeDataRaw);
    } catch {
      return { error: "typeData JSON 损坏" };
    }
    try {
      fieldsInput = JSON.parse(fieldsRaw);
    } catch {
      return { error: "fields JSON 损坏" };
    }

    const parsed = cardUpdateSchema.safeParse({
      id,
      deckId,
      frontContent,
      backContent,
      typeData,
      fields: fieldsInput,
      isFavorite,
      suspended,
      shuffleOptOut,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return { fieldErrors };
    }

    const existing = await prisma.card.findFirst({
      where: { id: parsed.data.id, deck: { id: deckId, userId: session.user.id } },
      select: { id: true, deckId: true, deck: { select: { noteType: { select: { id: true, fields: { orderBy: { ord: "asc" } } } } } } },
    });
    if (!existing) return { error: "未找到卡片" };

    const noteType = existing.deck.noteType;
    if (!noteType) return { error: "未找到模板" };

    const fieldIdByName = new Map(noteType.fields.map((f) => [f.name, f.id]));

    await prisma.$transaction(async (tx) => {
      // Phase 04-05 Item 6 + 04-06 Feature A: re-read the deck's
      // shuffleOptions, then combine with the per-card opt-out flag
      // before persisting the override into Card.typeData.shuffle.
      const deckForShuffle = await tx.deck.findFirst({
        where: { id: parsed.data.deckId, userId: session.user.id },
        select: { shuffleOptions: true },
      });
      const typeDataWithShuffle = overrideShuffle(
        parsed.data.typeData,
        deckForShuffle?.shuffleOptions ?? true,
        parsed.data.shuffleOptOut
      );
      await tx.card.update({
        where: { id: parsed.data.id },
        data: {
          type: parsed.data.typeData.type,
          frontContent: parsed.data.frontContent,
          backContent: parsed.data.backContent,
          typeData: typeDataWithShuffle as Prisma.InputJsonValue,
          isFavorite: parsed.data.isFavorite,
          suspended: parsed.data.suspended,
          shuffleOptOut: parsed.data.shuffleOptOut,
        },
      });
      await syncCardFields(tx, parsed.data.id, fieldIdByName, parsed.data.fields);
    });

    revalidatePath(`/decks/${deckId}`);
    revalidatePath(`/decks/${deckId}/cards/${parsed.data.id}`);
    redirect(`/decks/${deckId}/cards/${parsed.data.id}`);
    return null;
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

export async function deleteCardAction(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("未登录");

    const cardId = String(formData.get("cardId") ?? "");
    const deckId = String(formData.get("deckId") ?? "");
    if (!cardId || !deckId) throw new Error("缺少 cardId / deckId");

    // D-04a + Pitfall 8: hard delete with compound ownership where.
    // Cascade on CardState.cardId / ReviewLog.cardId / CardField.cardId
    // (schema.prisma lines 100/126/141/214) removes the related rows.
    //
    // Use `deleteMany` (not `delete`) — it's idempotent: returns
    // { count: 0 } if the row was already gone (e.g. another tab
    // deleted it first, or the user double-clicked). `delete` with
    // a compound `where` on non-unique fields throws P2025 and
    // surfaces as 500. We swallow the "already gone" case.
    await prisma.card.deleteMany({
      where: { id: cardId, deck: { userId: session.user.id, id: deckId } },
    });

    // Whether or not the row existed, the desired end-state is
    // "the row is gone" — revalidate so the list re-renders.
    //
    // We do NOT call redirect() here. The caller (delete dialog from
    // the detail page, or card-row-menu from the list page) decides
    // whether to navigate. Triggering redirect() inside the action
    // forces a server round-trip + full page swap on every delete,
    // which made batch / list-row deletes feel laggy. router.refresh()
    // is enough for in-place list updates; the detail-page dialog
    // adds router.push() to leave the (now-404) card detail route.
    revalidatePath(`/decks/${deckId}`);
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

export async function toggleFavoriteAction(
  cardId: string,
  deckId: string
): Promise<{ isFavorite: boolean }> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("未登录");

    const userId = session.user.id;

    // Read current value with ownership check (defense-in-depth).
    const card = await prisma.card.findFirst({
      where: { id: cardId, deck: { userId, id: deckId } },
      select: { isFavorite: true },
    });
    if (!card) throw new Error("未找到卡片");

    // Conditional update -- succeeds only if the value hasn't changed
    // since we read it. If a concurrent request flipped it in the
    // window between read and write, count=0 and we re-read + retry
    // once. (WR-04: read-modify-write race.)
    let newValue = !card.isFavorite;
    const result = await prisma.card.updateMany({
      where: {
        id: cardId,
        deck: { userId, id: deckId },
        isFavorite: card.isFavorite,
      },
      data: { isFavorite: newValue },
    });

    if (result.count === 0) {
      const fresh = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId, id: deckId } },
        select: { isFavorite: true },
      });
      if (!fresh) throw new Error("未找到卡片");
      newValue = !fresh.isFavorite;
      await prisma.card.updateMany({
        where: {
          id: cardId,
          deck: { userId, id: deckId },
          isFavorite: fresh.isFavorite,
        },
        data: { isFavorite: newValue },
      });
    }

    // No revalidatePath: this toggle's effect is isolated to the button
    // on the card-detail page. The client updates local state from the
    // returned value (D-05).
    return { isFavorite: newValue };
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

export async function toggleSuspendedAction(
  cardId: string,
  deckId: string
): Promise<{ suspended: boolean }> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("未登录");

    const userId = session.user.id;

    // Read current value with ownership check (defense-in-depth).
    const card = await prisma.card.findFirst({
      where: { id: cardId, deck: { userId, id: deckId } },
      select: { suspended: true },
    });
    if (!card) throw new Error("未找到卡片");

    // Conditional update + 1-retry on race. See toggleFavoriteAction
    // for the rationale. (WR-04)
    let newValue = !card.suspended;
    const result = await prisma.card.updateMany({
      where: {
        id: cardId,
        deck: { userId, id: deckId },
        suspended: card.suspended,
      },
      data: { suspended: newValue },
    });

    if (result.count === 0) {
      const fresh = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId, id: deckId } },
        select: { suspended: true },
      });
      if (!fresh) throw new Error("未找到卡片");
      newValue = !fresh.suspended;
      await prisma.card.updateMany({
        where: {
          id: cardId,
          deck: { userId, id: deckId },
          suspended: fresh.suspended,
        },
        data: { suspended: newValue },
      });
    }

    // No revalidatePath: this toggle's effect is isolated to the button
    // on the card-detail page. The client updates local state from the
    // returned value (D-05).
    return { suspended: newValue };
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

// ─── 04-05 Item 7: batch card actions ────────────────────────────────

async function assertCardOwner(
  cardIds: string[],
  deckId: string,
  userId: string
): Promise<void> {
  if (cardIds.length === 0) {
    throw new Error("未选择任何卡片");
  }
  // Single query: every cardId must belong to a deck owned by userId.
  // If any don't match, the count will be < cardIds.length and we
  // reject the whole batch.
  const found = await prisma.card.count({
    where: { id: { in: cardIds }, deck: { id: deckId, userId } },
  });
  if (found !== cardIds.length) {
    throw new Error("卡片所有权校验失败");
  }
}

export async function batchDeleteCardsAction(
  cardIds: string[],
  deckId: string
): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("未登录");
    await assertCardOwner(cardIds, deckId, session.user.id);

    // Pitfall 8: use deleteMany for idempotency.
    await prisma.card.deleteMany({
      where: { id: { in: cardIds }, deck: { userId: session.user.id, id: deckId } },
    });

    revalidatePath(`/decks/${deckId}`);
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

export async function batchToggleFavoriteAction(
  cardIds: string[],
  deckId: string,
  favorite: boolean
): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("未登录");
    await assertCardOwner(cardIds, deckId, session.user.id);

    await prisma.card.updateMany({
      where: { id: { in: cardIds }, deck: { userId: session.user.id, id: deckId } },
      data: { isFavorite: favorite },
    });

    revalidatePath(`/decks/${deckId}`);
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

export async function batchToggleSuspendAction(
  cardIds: string[],
  deckId: string,
  suspend: boolean
): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("未登录");
    await assertCardOwner(cardIds, deckId, session.user.id);

    await prisma.card.updateMany({
      where: { id: { in: cardIds }, deck: { userId: session.user.id, id: deckId } },
      data: { suspended: suspend },
    });

    revalidatePath(`/decks/${deckId}`);
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}
