"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AuthError } from "next-auth";
import { auth } from "../../../../auth";
import { prisma } from "@/lib/prisma";
import { deckUpdateSchema, themeColorSchema } from "@/lib/validation";
import { generateShareToken } from "@/lib/share-token";

type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

export async function updateDeckAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    const parsed = deckUpdateSchema.safeParse({
      id: formData.get("id"),
      title: formData.get("title"),
      description: (formData.get("description") as string) || "",
      // Phase 04-05 Item 6: deck-level toggle for choice / multi_choice
      // option shuffle. The form sends "true" / "false" as a string.
      shuffleOptions: formData.get("shuffleOptions") === "true",
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return { fieldErrors };
    }

    // Pitfall 8: ownership check before any write.
    const deck = await prisma.deck.findFirst({
      where: { id: parsed.data.id, userId: session.user.id },
      select: { id: true },
    });
    if (!deck) return { error: "未找到牌组" };

    await prisma.deck.update({
      where: { id: deck.id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description?.length
          ? parsed.data.description
          : null,
        shuffleOptions: parsed.data.shuffleOptions,
      },
    });

    revalidatePath("/decks");
    revalidatePath(`/decks/${deck.id}`);
    revalidatePath(`/decks/${deck.id}/settings`);
    return null;
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

export async function deleteDeckAction(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("未登录");

    const id = formData.get("id");
    if (typeof id !== "string") throw new Error("缺少牌组 id");

    // D-04a: hard delete. Cascade on Deck.userId / NoteType.deckId removes
    // NoteType + Fields + CardTemplates (and future Cards / CardFields).
    //
    // Use `deleteMany` (not `delete`) — it's idempotent: returns
    // { count: 0 } if the row was already gone (e.g. another tab
    // deleted it first, or the user double-clicked). `delete` with
    // a compound `where` on non-unique fields throws P2025 and
    // surfaces as 500. We swallow the "already gone" case.
    await prisma.deck.deleteMany({
      where: { id, userId: session.user.id },
    });

    // Whether or not the row existed, the desired end-state is
    // "the row is gone" — revalidate + redirect unconditionally.
    revalidatePath("/decks");
    redirect("/decks");
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

// ─── Reset learning progress (Phase 8 follow-up) ──────────────────────

export type ResetProgressState =
  | { ok?: true; resetCount?: number; error?: string }
  | null;

/**
 * Reset every card in the deck back to a fresh "new" state — the
 * user-facing version of the manual fix used to repair FSRS data
 * corrupted by the pre-fix scheduler bugs.
 *
 * Drops CardState (cards return to `new`), drops ReviewLog (clears the
 * review history so a later undo can't restore a stale state and the
 * smart-recommend 30-day window starts clean), and zeroes Card.progress.
 * Card content / templates / favorites are untouched.
 *
 * `deleteMany` is idempotent (count:0 if already empty) — same
 * "the rows are gone" end-state contract as deleteDeckAction.
 */
export async function resetDeckProgressAction(
  _prev: ResetProgressState,
  formData: FormData
): Promise<ResetProgressState> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    const id = formData.get("id");
    if (typeof id !== "string") return { error: "缺少牌组 id" };

    // Ownership check before any write (defense in depth).
    const deck = await prisma.deck.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!deck) return { error: "未找到牌组" };

    // Resolve the deck's card ids up front so the deletes scope by the
    // direct `cardId` column (no relation-filter ambiguity).
    const cardRows = await prisma.card.findMany({
      where: { deckId: deck.id },
      select: { id: true },
    });
    const cardIds = cardRows.map((c) => c.id);

    const [, , reset] = await prisma.$transaction([
      prisma.cardState.deleteMany({ where: { cardId: { in: cardIds } } }),
      prisma.reviewLog.deleteMany({ where: { deckId: deck.id } }),
      prisma.card.updateMany({
        where: { deckId: deck.id },
        data: { progress: 0 },
      }),
    ]);

    revalidatePath("/decks");
    revalidatePath(`/decks/${deck.id}`);
    revalidatePath(`/decks/${deck.id}/settings`);
    return { ok: true, resetCount: reset.count };
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

// ─── Deck theme color (Phase 5 redesign) ──────────────────────────────

export type ColorPickerState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

/**
 * Update the deck's theme color (HSL triplet, e.g. `162 50% 58%`).
 *
 * Accepts the raw value from the form input. The form posts hex
 * (from `<input type="color">`) and pre-converts it before calling
 * this action via `<input type="hidden" name="themeColor">`. When
 * the value is the literal empty string, the column is cleared
 * (back to hash-derived default).
 */
export async function updateDeckColorAction(
  _prev: ColorPickerState,
  formData: FormData
): Promise<ColorPickerState> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    const id = formData.get("id");
    if (typeof id !== "string") return { error: "缺少牌组 id" };

    const raw = formData.get("themeColor");
    if (typeof raw !== "string") return { error: "缺少 themeColor" };

    // Empty string = clear the override (back to hash default).
    const toValidate = raw.trim() === "" ? null : raw;

    const parsed = themeColorSchema.safeParse(toValidate);
    if (!parsed.success) {
      return {
        fieldErrors: {
          themeColor: parsed.error.issues[0]?.message ?? "颜色格式无效",
        },
      };
    }

    // Pitfall 8: ownership check before any write.
    const deck = await prisma.deck.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!deck) return { error: "未找到牌组" };

    await prisma.deck.update({
      where: { id: deck.id },
      data: { themeColor: parsed.data },
    });

    revalidatePath("/decks");
    revalidatePath(`/decks/${deck.id}`);
    revalidatePath(`/decks/${deck.id}/settings`);
    return null;
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

// ─── Deck sharing (token-link clone snapshot) ─────────────────────────

export type ShareLinkState =
  | { ok?: true; shareToken?: string | null; error?: string }
  | null;

/**
 * Generate (or return the existing) share token for a deck. Idempotent:
 * if the deck already has a token we return it unchanged so the link
 * stays stable across re-shares. Ownership is checked before any write.
 *
 * On the astronomically-unlikely unique-constraint collision we retry
 * once with a fresh token (the @unique on Deck.shareToken is the real
 * backstop).
 */
export async function generateShareLinkAction(
  _prev: ShareLinkState,
  formData: FormData
): Promise<ShareLinkState> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    const id = formData.get("id");
    if (typeof id !== "string") return { error: "缺少牌组 id" };

    const deck = await prisma.deck.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, shareToken: true },
    });
    if (!deck) return { error: "未找到牌组" };

    if (deck.shareToken) {
      return { ok: true, shareToken: deck.shareToken };
    }

    let token = generateShareToken();
    try {
      await prisma.deck.update({
        where: { id: deck.id },
        data: { shareToken: token },
      });
    } catch {
      // Collision (or a concurrent enable) — retry once with a fresh token.
      token = generateShareToken();
      await prisma.deck.update({
        where: { id: deck.id },
        data: { shareToken: token },
      });
    }

    revalidatePath(`/decks/${deck.id}/settings`);
    return { ok: true, shareToken: token };
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}

/**
 * Revoke a deck's share token. Existing copies already imported are
 * unaffected (they're independent snapshots); only the live link stops
 * resolving. Idempotent — clearing an already-null token is a no-op.
 */
export async function disableShareLinkAction(
  _prev: ShareLinkState,
  formData: FormData
): Promise<ShareLinkState> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    const id = formData.get("id");
    if (typeof id !== "string") return { error: "缺少牌组 id" };

    // Ownership-scoped write; updateMany is idempotent (count 0 if the
    // deck is gone or not owned) so a stale request can't 500.
    await prisma.deck.updateMany({
      where: { id, userId: session.user.id },
      data: { shareToken: null },
    });

    revalidatePath(`/decks/${id}/settings`);
    return { ok: true, shareToken: null };
  } catch (e) {
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}
