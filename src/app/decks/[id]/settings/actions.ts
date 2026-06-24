"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { studyPlanSchema } from "@/lib/validation";
import { buildQueue, STUDY_PLAN_DEFAULTS } from "@/lib/fsrs";

// Phase 08-01: Study Plan server actions. Each guards writes with the
// local assertDeckOwner helper below. The ownership check is intentionally
// duplicated here (rather than imported from
// src/app/decks/[id]/study/actions.ts) because:
//   - study/actions.ts:assertCardOwner checks a CARD, not a DECK
//   - Phase 8 owns settings/* and does not import from study/*
//   - the helper is small (3 lines), so a shared lib helper is not worth it.
async function assertDeckOwner(
  deckId: string,
  userId: string
): Promise<void> {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    select: { id: true },
  });
  if (!deck) throw new Error("未找到牌组");
}

/**
 * Read 6 study-plan fields from a FormData payload and coerce them
 * into the types the Zod schema expects. Booleans arrive as
 * "true"/"false" strings (we render the form with hidden inputs
 * shaped like the deck-color form for symmetry), numbers as
 * strings. Centralizing the coercion here keeps both actions in
 * lock-step — adding a 7th field touches one site.
 */
function readStudyPlanForm(fd: FormData): {
  newPerDay: number;
  reviewsPerDay: number;
  requestRetention: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  firstSessionTargetProgress: number;
  ratingButtons: number;
  newRememberAsEasy: boolean;
} {
  return {
    newPerDay: Number(fd.get("newPerDay") ?? "0"),
    reviewsPerDay: Number(fd.get("reviewsPerDay") ?? "0"),
    requestRetention: Number(fd.get("requestRetention") ?? "0.9"),
    enableFuzz: fd.get("enableFuzz") === "true",
    enableShortTerm: fd.get("enableShortTerm") === "true",
    firstSessionTargetProgress: Number(
      fd.get("firstSessionTargetProgress") ?? "0.8"
    ),
    ratingButtons: Number(fd.get("ratingButtons") ?? "4"),
    newRememberAsEasy: fd.get("newRememberAsEasy") === "true",
  };
}

export type StudyPlanActionState = {
  ok?: true;
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

export type StudyPlanPreviewState = {
  ok?: true;
  total: number;
  newCount: number;
  reviewCount: number;
  learnCount: number;
  error?: string;
} | null;

export async function updateStudyPlanAction(
  _prev: StudyPlanActionState,
  formData: FormData
): Promise<StudyPlanActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  const deckId = String(formData.get("deckId") ?? "");
  const raw = readStudyPlanForm(formData);

  const parsed = studyPlanSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  try {
    await assertDeckOwner(deckId, session.user.id);
  } catch {
    return { error: "未找到牌组" };
  }

  // Single-row upsert keyed on the unique deckId. Phase 2 seeded a
  // row at deck-creation time, so for most decks this is an
  // UPDATE; brand-new decks (e.g. from a future flow) hit the
  // CREATE branch. Either way all 5 fields are written — no
  // partial-update path.
  await prisma.$transaction((tx) =>
    tx.studyPlan.upsert({
      where: { deckId },
      create: {
        deckId,
        userId: session.user.id,
        ...parsed.data,
      },
      update: parsed.data,
    })
  );

  revalidatePath(`/decks/${deckId}/settings`);
  revalidatePath(`/decks/${deckId}`);
  return { ok: true };
}

export async function previewStudyPlanAction(
  _prev: StudyPlanPreviewState,
  formData: FormData
): Promise<StudyPlanPreviewState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { total: 0, newCount: 0, reviewCount: 0, learnCount: 0, error: "未登录" };
  }

  const deckId = String(formData.get("deckId") ?? "");

  // Ownership check FIRST, before any deckId-scoped DB read. The
  // best-effort schema-fail preview below queries this deck's cards,
  // so the owner check must precede the parse, otherwise a malformed
  // draft could leak another user's card counts (CLAUDE.md: every
  // Server Action validates ownership server-side; defense in depth).
  try {
    await assertDeckOwner(deckId, session.user.id);
  } catch {
    return { total: 0, newCount: 0, reviewCount: 0, learnCount: 0, error: "未找到牌组" };
  }

  const raw = readStudyPlanForm(formData);

  const parsed = studyPlanSchema.safeParse(raw);
  if (!parsed.success) {
    // Preview is best-effort: a malformed draft should not crash
    // the form. Fall back to the STUDY_PLAN_DEFAULTS so the user
    // still sees *some* preview while editing the offending field.
    const cards = await prisma.card.findMany({
      where: { deckId, suspended: false },
      include: { cardState: true },
    });
    const result = buildQueue(cards, STUDY_PLAN_DEFAULTS, new Date());
    return {
      total: result.queue.length,
      newCount: result.newCount,
      reviewCount: result.reviewCount,
      learnCount: result.learnCount,
      error: parsed.error.issues[0]?.message ?? "参数无效",
    };
  }

  // The cards in this deck + their FSRS state. Suspended cards are
  // excluded — they never reach the study session, so they should
  // not count toward "today's plan" either.
  const cards = await prisma.card.findMany({
    where: { deckId, suspended: false },
    include: { cardState: true },
  });

  // Phase 08-04 hotfix: StudyPlanShape now carries
  // firstSessionTargetProgress. Threading it through the preview
  // here means the "today's plan" number matches what
  // /api/decks/[id]/study and /decks/[id]/study compute, so a user
  // with threshold=0.80 sees the same reviewCount in preview as
  // in the live session. The 4 other StudyPlan fields
  // (requestRetention / enableFuzz / enableShortTerm) are still
  // FSRS-scheduler-only and don't affect buildQueue.
  const result = buildQueue(
    cards,
    {
      newPerDay: parsed.data.newPerDay,
      reviewsPerDay: parsed.data.reviewsPerDay,
      firstSessionTargetProgress: parsed.data.firstSessionTargetProgress,
    },
    new Date()
  );

  return {
    ok: true,
    total: result.queue.length,
    newCount: result.newCount,
    reviewCount: result.reviewCount,
    learnCount: result.learnCount,
  };
}

// Phase 08-04: smart-recommendation server action. Returns
// recommended values without writing to the DB — the user still
// has to hit "保存" to persist. The "智能推荐 v6" button on the
// form fills the form fields from this response; explicit save
// is the only thing that touches the StudyPlan row.

export type RecommendStudyPlanState = {
  ok?: true;
  // 6 numeric/bool fields matching the form's controlled state.
  // The `source` and `rationale` are passed back too so the
  // form can show the user WHY each value was chosen (median of
  // 30 days vs Anki Desktop default).
  values?: {
    newPerDay: number;
    reviewsPerDay: number;
    requestRetention: number;
    enableFuzz: boolean;
    enableShortTerm: boolean;
    firstSessionTargetProgress: number;
    source: "user-history-30d" | "anki-default-fallback";
    rationale: {
      newPerDay: string;
      reviewsPerDay: string;
      requestRetention: string;
      enableFuzz: string;
      enableShortTerm: string;
      firstSessionTargetProgress: string;
    };
  };
  error?: string;
} | null;

export async function recommendStudyPlanAction(
  _prev: RecommendStudyPlanState,
  formData: FormData
): Promise<RecommendStudyPlanState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  const deckId = String(formData.get("deckId") ?? "");

  // Ownership check — same pattern as the other Study Plan actions.
  // The smart-recommendation operates on user-wide history so a
  // bad deckId from a hostile caller could only make the action
  // produce per-user recommendations without writing anything.
  try {
    await assertDeckOwner(deckId, session.user.id);
  } catch {
    return { error: "未找到牌组" };
  }

  // The lib function is server-only (imports prisma). Direct
  // await here — it's a single read, latency is dominated by
  // the ReviewLog scan.
  const { recommendStudyPlanForDeck } = await import("@/lib/fsrs/smart-recommend");
  const recommended = await recommendStudyPlanForDeck(
    session.user.id,
    deckId
  );

  return { ok: true, values: recommended };
}

// Phase 12-05: settingsMode persistence. D-15/D-16 — persists the
// per-deck simple/pro choice to Deck.settingsMode. T-12-04 mitigation:
// validate mode server-side before any write so a tampered request
// cannot persist an invalid value.

export type UpdateSettingsModeState = { error?: string } | null;

export async function updateSettingsModeAction(
  _prev: UpdateSettingsModeState,
  formData: FormData
): Promise<UpdateSettingsModeState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  const deckId = String(formData.get("deckId") ?? "");

  // T-12-04: validate BEFORE ownership check and before any DB write.
  const mode = formData.get("settingsMode");
  if (mode !== "simple" && mode !== "pro") return { error: "无效的模式" };

  try {
    await assertDeckOwner(deckId, session.user.id);
  } catch {
    return { error: "未找到牌组" };
  }

  await prisma.deck.update({
    where: { id: deckId },
    data: { settingsMode: mode },
  });

  revalidatePath(`/decks/${deckId}/settings`);
  return null;
}
