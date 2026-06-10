"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { CARD_TYPES, type CardType, type CardCreateInput } from "@/lib/validation";
import { parseCardBatch, type ParseRowError } from "@/lib/card-import";
import type { Prisma } from "@prisma/client";

// D-13: preview state returned to the client before any DB write
export type ParseImportState = {
  cards?: CardCreateInput[];
  errors?: ParseRowError[];
  error?: string;
} | null;

// ─── Shared auth + ownership guard ───────────────────────────────────────────

async function getSessionAndDeck(
  formData: FormData
): Promise<
  | { error: string }
  | { userId: string; deck: { id: string }; cardType: CardType | "auto"; text: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };
  const userId = session.user.id;

  const rawDeckId = formData.get("deckId");
  if (typeof rawDeckId !== "string" || !rawDeckId) return { error: "缺少 deckId" };

  // T-12-01: server-side ownership check — defense in depth even though
  // middleware guards the route (CLAUDE.md hard rule).
  const deck = await prisma.deck.findFirst({
    where: { id: rawDeckId, userId },
    select: { id: true },
  });
  if (!deck) return { error: "未找到牌组" };

  // "auto" = mixed batch (parser detects each card's type); otherwise one
  // explicit type for the whole batch.
  const rawCardType = String(formData.get("cardType") ?? "");
  if (rawCardType !== "auto" && !(CARD_TYPES as readonly string[]).includes(rawCardType)) {
    return { error: "无效的卡片类型" };
  }
  const cardType = rawCardType as CardType | "auto";

  const text = String(formData.get("text") ?? "");

  return { userId, deck, cardType, text };
}

// ─── parseImportAction ────────────────────────────────────────────────────────
// D-13: preview only — parses the raw markdown and returns { cards, errors }
// without writing anything to the database.

export async function parseImportAction(
  _prev: ParseImportState,
  formData: FormData
): Promise<ParseImportState> {
  const result = await getSessionAndDeck(formData);
  if ("error" in result) return { error: result.error };

  const { deck, cardType, text } = result;
  const { cards, errors } = parseCardBatch(text, cardType, deck.id);
  return { cards, errors };
}

// ─── confirmImportAction ──────────────────────────────────────────────────────
// T-12-05/Pitfall 8: re-parses raw markdown server-side on confirm — the client
// array (if any) is ignored entirely to prevent tampering.
// D-11: append-only via createMany — existing cards are never touched.

export async function confirmImportAction(
  _prev: { imported?: number; skipped?: number; error?: string } | null,
  formData: FormData
): Promise<{ imported?: number; skipped?: number; error?: string } | null> {
  const result = await getSessionAndDeck(formData);
  if ("error" in result) return { error: result.error };

  const { deck, cardType, text } = result;

  // T-12-05: server-side re-parse — never trust a client-supplied card array
  const { cards, errors } = parseCardBatch(text, cardType, deck.id);

  if (cards.length === 0) {
    const failMsg =
      errors.length > 0
        ? `没有可导入的卡片 (${errors.length} 行解析失败)`
        : "没有可导入的卡片";
    return { error: failMsg };
  }

  // T-12-CM-01: write ONLY the 5 scalar Card columns.
  // Exclude: fields (CardField relation, not a column), isFavorite,
  // suspended, shuffleOptOut (let Prisma @default apply).
  await prisma.card.createMany({
    data: cards.map((c) => ({
      deckId: deck.id,
      type: c.typeData.type,
      frontContent: c.frontContent,
      backContent: c.backContent,
      typeData: c.typeData as Prisma.InputJsonValue,
    })),
  });

  revalidatePath(`/decks/${deck.id}/settings`);
  revalidatePath(`/decks/${deck.id}`);
  // Report skipped rows so a partial import is not silently rounded up
  // to "success" (WR-02). The preview already showed failures, but the
  // confirm result should still be honest about what was written.
  return { imported: cards.length, skipped: errors.length };
}
