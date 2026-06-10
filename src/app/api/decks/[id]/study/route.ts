import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { buildQueue, STUDY_PLAN_DEFAULTS } from "@/lib/fsrs";

export const dynamic = "force-dynamic";

/**
 * GET /api/decks/[id]/study
 *
 * Returns today's study queue for the deck owned by the authenticated
 * user. The queue is ordered learning → review → new, with `new` and
 * `review` capped by the deck's StudyPlan (or `STUDY_PLAN_DEFAULTS`
 * if no plan exists yet — Phase 2 seeded a plan for new decks but
 * historical decks may not have one).
 *
 * Defense in depth: middleware already gates `/api/*` (see
 * `src/middleware.ts`), but the handler re-checks the session so a
 * misconfigured matcher cannot leak the route. Ownership is enforced
 * with a nested `deck.userId` where clause — non-owned deckIds get
 * a 404 (not 403) so we don't leak existence to attackers.
 *
 * The `tz: "server"` field is reserved for Phase 8+ multi-timezone
 * support; for now the server clock is the single source of truth.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId: session.user.id },
    select: { id: true },
  });
  if (!deck) {
    return NextResponse.json({ error: "牌组不存在" }, { status: 404 });
  }

  const cards = await prisma.card.findMany({
    where: { deckId, suspended: false },
    include: { cardState: true },
    orderBy: { createdAt: "asc" },
  });

  const plan = await prisma.studyPlan.findUnique({
    where: { deckId },
    // Phase 08-04 hotfix: include firstSessionTargetProgress so
    // buildQueue's re-bucket (state=new AND progress >= threshold →
    // review bucket) actually fires. Before this fix the threshold
    // defaulted to 1.0 = never re-bucket.
    select: {
      newPerDay: true,
      reviewsPerDay: true,
      firstSessionTargetProgress: true,
    },
  });
  const effectivePlan = plan
    ? {
        newPerDay: plan.newPerDay,
        reviewsPerDay: plan.reviewsPerDay,
        firstSessionTargetProgress: plan.firstSessionTargetProgress,
      }
    : STUDY_PLAN_DEFAULTS;

  const result = buildQueue(cards, effectivePlan, new Date());

  return NextResponse.json({
    deckId,
    queue: result.queue,
    newCount: result.newCount,
    learnCount: result.learnCount,
    reviewCount: result.reviewCount,
    caps: result.caps,
    tz: "server",
  });
}
