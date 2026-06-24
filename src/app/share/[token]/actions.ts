"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "../../../../auth";
import { prisma } from "@/lib/prisma";

export type ImportSharedDeckState =
  | { ok?: true; deckId?: string; error?: string }
  | null;

// DoS guard: bound how large a deck a single import may materialize.
// Mirrors the manual-import path's MAX_IMPORT_CARDS guard so a hostile
// sharer can't publish an enormous deck that OOMs an importer who opts
// in. Generous enough for any realistic study deck; cards can each carry
// up to ~8MB of base64 image content, so the in-memory clone graph + the
// single createMany transaction are the real cost being bounded.
const MAX_SHARE_IMPORT_CARDS = 5000;

/**
 * Deep-clone a shared deck into the caller's account (B-deckshare).
 *
 * A ONE-TIME SNAPSHOT — copies the Deck, its NoteType (+ Fields +
 * CardTemplates), every Card (+ CardField values), and the StudyPlan
 * config. It deliberately does NOT copy any per-user FSRS state
 * (CardState / ReviewLog) or the source owner's personal card flags:
 * the importer starts every card brand-new (progress 0, not favorited,
 * not suspended). The new deck is private (shareToken null).
 *
 * Implementation: all primary keys are generated up front so the whole
 * clone runs as a single sequential `$transaction([...])` of
 * createMany calls — atomic, and immune to the interactive-transaction
 * timeout that a per-card loop would hit on a large deck. Operation
 * order respects FK dependencies (Deck → NoteType → Field/Template →
 * Card → CardField → StudyPlan).
 */
export async function importSharedDeckAction(
  _prev: ImportSharedDeckState,
  formData: FormData
): Promise<ImportSharedDeckState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "请先登录后再导入" };
  const userId = session.user.id;

  const token = formData.get("token");
  if (typeof token !== "string" || token.length === 0) {
    return { error: "分享链接无效" };
  }

  // Cheap existence + size check BEFORE materializing the full clone
  // graph, so an over-cap (or hostile) deck is rejected without ever
  // loading every card + image into memory.
  const meta = await prisma.deck.findUnique({
    where: { shareToken: token },
    select: { id: true, _count: { select: { cards: true } } },
  });
  if (!meta) return { error: "分享链接无效或已失效" };
  if (meta._count.cards > MAX_SHARE_IMPORT_CARDS) {
    return {
      error: `该牌组卡片过多（超过 ${MAX_SHARE_IMPORT_CARDS} 张），暂无法导入`,
    };
  }

  const src = await prisma.deck.findUnique({
    where: { shareToken: token },
    include: {
      noteType: { include: { fields: true, templates: true } },
      cards: { include: { fields: true } },
      studyPlan: true,
    },
  });
  if (!src) return { error: "分享链接无效或已失效" };

  // ── Pre-generate every new primary key so the clone is a single
  //    sequential transaction with no read-back between writes. ──────
  const newDeckId = crypto.randomUUID();
  const newNoteTypeId = crypto.randomUUID();

  // old Field id -> new Field id (used to remap each card's CardFields).
  const fieldIdMap = new Map<string, string>();
  for (const f of src.noteType?.fields ?? []) {
    fieldIdMap.set(f.id, crypto.randomUUID());
  }
  // old Card id -> new Card id.
  const cardIdMap = new Map<string, string>();
  for (const c of src.cards) cardIdMap.set(c.id, crypto.randomUUID());

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  // 1) Deck — fresh owner, private (no shareToken carried over).
  ops.push(
    prisma.deck.create({
      data: {
        id: newDeckId,
        userId,
        title: src.title,
        description: src.description,
        themeColor: src.themeColor,
        shuffleOptions: src.shuffleOptions,
        settingsMode: src.settingsMode,
      },
    })
  );

  // 2) NoteType (+ Fields + CardTemplates).
  if (src.noteType) {
    ops.push(
      prisma.noteType.create({
        data: {
          id: newNoteTypeId,
          deckId: newDeckId,
          userId,
          name: src.noteType.name,
          config: src.noteType.config,
        },
      })
    );
    if (src.noteType.fields.length > 0) {
      ops.push(
        prisma.field.createMany({
          data: src.noteType.fields.map((f) => ({
            id: fieldIdMap.get(f.id)!,
            noteTypeId: newNoteTypeId,
            name: f.name,
            ord: f.ord,
          })),
        })
      );
    }
    if (src.noteType.templates.length > 0) {
      ops.push(
        prisma.cardTemplate.createMany({
          data: src.noteType.templates.map((t) => ({
            id: crypto.randomUUID(),
            noteTypeId: newNoteTypeId,
            name: t.name,
            ord: t.ord,
            qfmt: t.qfmt,
            afmt: t.afmt,
          })),
        })
      );
    }
  }

  // 3) Cards — fresh state (progress 0, not favorited / suspended).
  if (src.cards.length > 0) {
    ops.push(
      prisma.card.createMany({
        data: src.cards.map((c) => ({
          id: cardIdMap.get(c.id)!,
          deckId: newDeckId,
          type: c.type,
          frontContent: c.frontContent,
          backContent: c.backContent,
          typeData:
            c.typeData === null
              ? Prisma.DbNull
              : (c.typeData as Prisma.InputJsonValue),
          shuffleOptOut: c.shuffleOptOut,
        })),
      })
    );

    // 4) CardField values, remapped onto the cloned Field ids. Drop any
    //    field reference that isn't part of this deck's NoteType.
    const newCardFields = src.cards.flatMap((c) =>
      c.fields
        .filter((cf) => fieldIdMap.has(cf.fieldId))
        .map((cf) => ({
          id: crypto.randomUUID(),
          cardId: cardIdMap.get(c.id)!,
          fieldId: fieldIdMap.get(cf.fieldId)!,
          value: cf.value,
        }))
    );
    if (newCardFields.length > 0) {
      ops.push(prisma.cardField.createMany({ data: newCardFields }));
    }
  }

  // 5) StudyPlan config (scheduler knobs only — no per-user state).
  if (src.studyPlan) {
    ops.push(
      prisma.studyPlan.create({
        data: {
          id: crypto.randomUUID(),
          deckId: newDeckId,
          userId,
          newPerDay: src.studyPlan.newPerDay,
          reviewsPerDay: src.studyPlan.reviewsPerDay,
          requestRetention: src.studyPlan.requestRetention,
          enableFuzz: src.studyPlan.enableFuzz,
          enableShortTerm: src.studyPlan.enableShortTerm,
          ratingButtons: src.studyPlan.ratingButtons,
          newRememberAsEasy: src.studyPlan.newRememberAsEasy,
          firstSessionTargetProgress: src.studyPlan.firstSessionTargetProgress,
        },
      })
    );
  }

  try {
    await prisma.$transaction(ops);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "导入失败，请重试" };
  }

  revalidatePath("/decks");
  return { ok: true, deckId: newDeckId };
}
