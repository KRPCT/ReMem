import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { studyAnswerSchema } from "@/lib/validation";
import { answerCard } from "@/lib/fsrs";

export const dynamic = "force-dynamic";

/**
 * POST /api/study/answer
 *
 * URL-addressable counterpart of `answerCardAction`. The Server
 * Action exists for the Phase 7 study session UI; this route is the
 * stable external surface for any non-browser consumer (mobile,
 * CLI, tests, future integrations). Both call the same lib fn so
 * the audit / state semantics stay in lockstep.
 *
 * Status codes:
 *   200 — answered; body = `{ state: { 9 fields } }`
 *   400 — request body is not JSON, or Zod failed
 *   401 — no session
 *   404 — cardId does not belong to the caller (existence-leak safe)
 *   500 — lib threw (rating out of range at the ts-fsrs boundary,
 *         card vanished mid-request, etc.)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "请求体必须为 JSON" },
      { status: 400 }
    );
  }

  const parsed = studyAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "请求格式错误",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  // Defense in depth: confirm ownership here too, even though
  // answerCard() repeats the check inside its $transaction.
  const owns = await prisma.card.findFirst({
    where: {
      id: parsed.data.cardId,
      deck: { userId: session.user.id },
    },
    select: { id: true },
  });
  if (!owns) {
    return NextResponse.json(
      { error: "卡片不存在或无权访问" },
      { status: 404 }
    );
  }

  try {
    const { state: newState } = await answerCard({
      cardId: parsed.data.cardId,
      rating: parsed.data.rating,
      userId: session.user.id,
    });
    return NextResponse.json({
      state: {
        stability: newState.stability ?? 0,
        difficulty: newState.difficulty ?? 0,
        elapsedDays: newState.elapsedDays ?? 0,
        scheduledDays: newState.scheduledDays ?? 0,
        reps: newState.reps,
        lapses: newState.lapses,
        state: newState.state,
        lastReview: newState.lastReview?.toISOString() ?? null,
        due: newState.due?.toISOString() ?? null,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "未知错误" },
      { status: 500 }
    );
  }
}
