import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { studyUndoSchema } from "@/lib/validation";
import { revertLastAnswer } from "@/lib/fsrs";

export const dynamic = "force-dynamic";

/**
 * POST /api/study/undo
 *
 * URL-addressable counterpart of `undoCardAction`. Restores the
 * most recent review for the card and stamps `undoneAt` on the
 * ReviewLog so the audit trail stays intact.
 *
 * Status codes:
 *   200 — `{ restored, cardId, reason? }`; 200 also on the
 *         no-history branch (`restored: false, reason: "no-history"`)
 *   400 — request body is not JSON, or Zod failed
 *   401 — no session
 *   404 — cardId does not belong to the caller
 *   500 — lib threw
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

  const parsed = studyUndoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "请求格式错误",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

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
    const result = await revertLastAnswer({
      cardId: parsed.data.cardId,
      userId: session.user.id,
    });
    return NextResponse.json({
      restored: result.restored,
      cardId: result.cardId,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "未知错误" },
      { status: 500 }
    );
  }
}
