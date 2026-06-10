"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { studyAnswerSchema, studyUndoSchema } from "@/lib/validation";
import { answerCard, revertLastAnswer } from "@/lib/fsrs";

// Phase 7: study-session "toggle favorite" Server Action contract.
// Mirrors studyAnswerSchema / studyUndoSchema — only cardId is required;
// the deckId is implicit in assertCardOwner's nested `deck: { userId }`
// where (defense in depth: the FormData value is not trusted).
const toggleFavoriteStudySchema = z.object({
  cardId: z.string().min(1, "缺少 cardId"),
});

/**
 * Result envelope for the study Server Actions. A discriminated union
 * with the explicit `ok: true` tag is overkill — the Phase 7 study
 * session UI just reads the shape it expects, and the absence of an
 * `error`/`fieldErrors` key signals success.
 *
 * `newState` is the 9-field CardState projection (no db row id /
 * createdAt leaked to the client). `restored` + `reason` are the
 * undo action's two return states (the lib's "no-history" branch
 * surfaces as `restored: false, reason: "no-history"`).
 */
export type StudyActionState = {
  ok?: true;
  newState?: {
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    reps: number;
    lapses: number;
    state: string;
    lastReview: string | null;
    due: string | null;
    // Phase 08-02: per-card FSRS 6 progress (0-1 float). Surfaced
    // by the study session UI as a top-of-card hairline bar and
    // as a "学习进度" stat on the card detail page.
    progress: number;
  };
  // Phase 8 (re-exec): true when the card did NOT graduate / reach the
  // first-session threshold, so the session should re-test it later at a
  // random slot. Derived server-side from the scheduling strategy.
  requeueInSession?: boolean;
  restored?: boolean;
  cardId?: string;
  reason?: string;
  // Phase 7: returned by toggleFavoriteStudyAction so the optimistic
  // UI can confirm the new value without re-reading the database.
  isFavorite?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

/**
 * Defense-in-depth ownership check used by both Server Actions. We
 * select `{ id, deckId }` and return the deckId so the caller can
 * use the *looked-up* deckId (not the unauthenticated FormData
 * value) for `revalidatePath`. Throws on miss so the caller's
 * `try/catch` (or `.catch(() => null)` short-circuit) can return a
 * single error shape.
 *
 * Review: WR-02 — the looked-up deckId is the defense-in-depth
 * value. The FormData-supplied deckId was an unauthenticated hint
 * and could in principle point at a deck the caller doesn't own.
 */
async function assertCardOwner(
  cardId: string,
  userId: string
): Promise<{ id: string; deckId: string }> {
  const card = await prisma.card.findFirst({
    where: { id: cardId, deck: { userId } },
    select: { id: true, deckId: true },
  });
  if (!card) throw new Error("卡片不存在或无权访问");
  return card;
}

export async function answerCardAction(
  _prev: StudyActionState,
  fd: FormData
): Promise<StudyActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  const cardId = String(fd.get("cardId") ?? "");
  const ratingRaw = String(fd.get("rating") ?? "");

  const parsed = studyAnswerSchema.safeParse({
    cardId,
    rating: Number(ratingRaw),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  // Ownership is enforced inside answerCard()'s $transaction via
  // tx.card.findFirst({ where: { id, deck: { userId } } }), which throws
  // "卡片不存在或无权访问" on a miss — caught by the outer try/catch below
  // and returned as { error }. The pre-check assertCardOwner call was
  // redundant: it ran the same ownership query one extra time before
  // the transaction re-ran it anyway. Removing it cuts two DB round-trips
  // to one with no change in security posture (ASVS V4 gate intact).
  try {
    const answer = await answerCard({
      cardId: parsed.data.cardId,
      rating: parsed.data.rating,
      userId: session.user.id,
    });
    // NOTE: deliberately NO revalidatePath here. The study page is a
    // CLIENT session (StudySession owns the in-memory queue, incl. the
    // Phase-8 in-session re-queue). Calling revalidatePath from this
    // action re-renders the force-dynamic /study route mid-session;
    // once the just-rated cards are no longer "due", the server's
    // buildQueue returns empty and its empty-state branch UNMOUNTS the
    // live session — wiping the re-queued cards (and, historically,
    // making the session feel like it "次次过完"). The deck detail page
    // (`/decks/[id]`) reads auth so it is dynamic and shows fresh mean
    // progress on the next navigation without an explicit revalidate.
    // The CardState columns for stability / difficulty / elapsedDays /
    // scheduledDays are nullable in the schema, but the
    // answerCard() -> fromFsrsCard() write path always sets them to
    // finite numbers. Coerce to `number` with `?? 0` for the projection
    // so the client sees a clean non-nullable shape. `progress` and
    // `requeueInSession` come straight from the scheduling result (same
    // $transaction) — no extra round-trip.
    const newState = answer.state;
    return {
      ok: true,
      requeueInSession: answer.requeueInSession,
      newState: {
        stability: newState.stability ?? 0,
        difficulty: newState.difficulty ?? 0,
        elapsedDays: newState.elapsedDays ?? 0,
        scheduledDays: newState.scheduledDays ?? 0,
        reps: newState.reps,
        lapses: newState.lapses,
        state: newState.state,
        lastReview: newState.lastReview?.toISOString() ?? null,
        due: newState.due?.toISOString() ?? null,
        progress: answer.progress,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "未知错误" };
  }
}

export async function undoCardAction(
  _prev: StudyActionState,
  fd: FormData
): Promise<StudyActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  const cardId = String(fd.get("cardId") ?? "");

  const parsed = studyUndoSchema.safeParse({ cardId });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  let ownedDeckId: string;
  try {
    const owned = await assertCardOwner(parsed.data.cardId, session.user.id);
    ownedDeckId = owned.deckId;
  } catch {
    return { error: "卡片不存在或无权访问" };
  }

  try {
    const result = await revertLastAnswer({
      cardId: parsed.data.cardId,
      userId: session.user.id,
    });
    // Use the looked-up deckId (defense in depth) — not the
    // unauthenticated FormData value. WR-02 fix.
    revalidatePath(`/decks/${ownedDeckId}`);
    return {
      ok: true,
      restored: result.restored,
      cardId: result.cardId,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "未知错误" };
  }
}

/**
 * Phase 7: toggle a card's `isFavorite` flag from inside the study
 * session. Mirrors `toggleFavoriteAction` (src/app/decks/[id]/cards/
 * actions.ts) but uses the FormData signature + StudyActionState
 * envelope the study session already speaks, and *returns* the new
 * value so the optimistic UI doesn't have to re-read.
 *
 * Read → conditional updateMany → 1 retry. The conditional `where:
 * { isFavorite: current }` makes the write idempotent against a
 * concurrent request: if another tab already flipped the flag, our
 * first updateMany returns count=0 and we re-read + retry once.
 */
export async function toggleFavoriteStudyAction(
  _prev: StudyActionState,
  fd: FormData
): Promise<StudyActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  const cardId = String(fd.get("cardId") ?? "");

  const parsed = toggleFavoriteStudySchema.safeParse({ cardId });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  let ownedDeckId: string;
  try {
    const owned = await assertCardOwner(parsed.data.cardId, session.user.id);
    ownedDeckId = owned.deckId;
  } catch {
    return { error: "卡片不存在或无权访问" };
  }

  const userId = session.user.id;
  try {
    // Read current value with ownership check (defense in depth — the
    // nested `deck: { userId }` where is the real security boundary;
    // assertCardOwner above has already validated, so this is a cheap
    // double-check that also serves the retry path).
    const current = await prisma.card.findFirst({
      where: { id: cardId, deck: { userId } },
      select: { isFavorite: true },
    });
    if (!current) return { error: "卡片不存在或无权访问" };

    let newFavorite = !current.isFavorite;

    const result = await prisma.card.updateMany({
      where: {
        id: cardId,
        deck: { userId },
        isFavorite: current.isFavorite,
      },
      data: { isFavorite: newFavorite },
    });

    if (result.count === 0) {
      // Concurrent flip (WR-04): re-read the fresh value and retry once.
      const fresh = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
        select: { isFavorite: true },
      });
      if (!fresh) return { error: "卡片不存在或无权访问" };
      newFavorite = !fresh.isFavorite;
      await prisma.card.updateMany({
        where: {
          id: cardId,
          deck: { userId },
          isFavorite: fresh.isFavorite,
        },
        data: { isFavorite: newFavorite },
      });
    }

    // Use the looked-up deckId (defense in depth) — not the
    // unauthenticated FormData value. WR-02 fix.
    revalidatePath(`/decks/${ownedDeckId}`);
    return {
      ok: true,
      cardId: parsed.data.cardId,
      isFavorite: newFavorite,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "未知错误" };
  }
}
