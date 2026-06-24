import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { getUserPrefs } from "@/lib/user-settings";
import { buildQueue, STUDY_PLAN_DEFAULTS } from "@/lib/fsrs";
import type { StudyPlanShape } from "@/lib/fsrs/queue";
import { ZhTitle } from "@/components/typography/zh-title";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StudySession } from "./study-session";

/**
 * Phase 07: 学习会话页(服务端入口)。
 *
 * 1. auth + 所有权校验,deck 不存在或非当前用户 -> notFound()
 * 2. 根据 `?mode=cram` 决定队列构建策略:
 *    - default: 走 06-01 buildQueue,尊重 StudyPlan 的 newPerDay / reviewsPerDay cap
 *    - cram:    拉全部未暂停卡片(createdAt 顺序),不应用 cap,无视 due 时间
 *               适用场景:"立刻复习" —— 即便今日队列为空,也想把全部卡片过一遍
 *               ReviewLog 仍然写入(后续可基于 undoneAt / studiedAt 区分)
 * 3. 队列为空时直接渲染 "今日无待复习" 状态,内嵌"立刻复习"CTA 跳到 cram
 * 4. 把队列 + 牌组名 + 牌组 ID + mode 传给客户端 StudySession
 *
 * Server-only:不导出 use client。fsrs lib 之外的另一个 fsrs 入口。
 */
export const dynamic = "force-dynamic";

interface StudyPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; favorites?: string }>;
}

export default async function StudyPage({
  params,
  searchParams,
}: StudyPageProps) {
  const { id: deckId } = await params;
  const { mode, favorites } = await searchParams;
  const userId = await requireUserId();
  const isCram = mode === "cram";
  // Phase 7-02: 严格 `=== "1"` 匹配开启,任何其他值 / 缺省都视为关闭
  const favoritesOnly = favorites === "1";

  // 1. 所有权 + 牌组元信息(牌组名用作页面标题,无牌组时 notFound)
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    select: { id: true, title: true },
  });
  if (!deck) notFound();

  // 2. 拉卡片(join cardState)。favoritesOnly=true 时 prisma 直接
  //    在 SQL 层把非收藏卡挡掉,与 buildQueue 内部过滤构成双重
  //    防御 —— 客户端拿到的 cards 数组只含收藏,即使 buildQueue
  //    内部过滤逻辑回归,UI 也只会展示收藏卡。
  const cards = await prisma.card.findMany({
    where: {
      deckId,
      suspended: false,
      ...(favoritesOnly ? { isFavorite: true } : {}),
    },
    include: { cardState: true },
    orderBy: { createdAt: "asc" },
  });

  // Phase 14: per-deck rating-bar settings. Independent of cram/normal — the
  // 2/3/4-key collapse and the new-card Good->Easy remap are UI-layer, so they
  // apply in both modes. A separate single-row read (the normal-mode plan query
  // below only selects scheduler fields).
  const ratingPlan = await prisma.studyPlan.findUnique({
    where: { deckId },
    select: { ratingButtons: true, newRememberAsEasy: true },
  });
  const ratingButtons: 2 | 3 | 4 =
    ratingPlan?.ratingButtons === 2 || ratingPlan?.ratingButtons === 3
      ? ratingPlan.ratingButtons
      : 4;
  const treatRememberAsEasyOnNew = ratingPlan?.newRememberAsEasy ?? false;

  // B2: account-level study prefs (next-review line + cloze auto-reveal).
  const { showNextReviewTime, autoRevealCloze } = await getUserPrefs(userId);

  // 3. 算队列 + totalFavorites。buildResult 提到 if/else 之前
  //    (isCram 时为 null),totalFavorites 与 queueItems 都从它
  //    派生,避免在两个分支里各算一次造成漂移。
  let queueItems: Array<{
    cardId: string;
    type: string;
    frontContent: string | null;
    backContent: string | null;
    // typeData 是非 qa 题型的答案所在(选项 / 填空答案 / 判断正误);
    // qa 题型不带 typeData。客户端用它渲染"答案"和判分。
    typeData: unknown;
    // Phase 7-03: isFavorite is the initial heart-fill for the
    // toolbar button. The card body's `Card` row already includes
    // this column; we just project it into the StudyCard payload.
    isFavorite: boolean;
    // Phase 08-02: per-card FSRS 6 progress (0-1 float) for the
    // top-of-card hairline bar.
    progress: number;
    // Phase 14: is this card still NEW (never graduated)? Drives the
    // "记得视作简单" Good->Easy remap in the rating bar.
    isNew: boolean;
  }> = [];
  let totalCounts = { newCount: 0, learnCount: 0, reviewCount: 0 };
  let buildResult: ReturnType<typeof buildQueue> | null = null;
  // Phase 08-04 hotfix: planUsed now carries the full StudyPlanShape
  // (incl. firstSessionTargetProgress) so the buildQueue re-bucket
  // path actually fires in production. Before this fix the select
  // was 2-field and the threshold defaulted to 1.0 = never re-bucket.
  let planUsed: StudyPlanShape = STUDY_PLAN_DEFAULTS;

  if (!isCram) {
    // Normal 模式:StudyPlan 默认值兜底
    planUsed =
      (await prisma.studyPlan.findUnique({
        where: { deckId },
        select: {
          newPerDay: true,
          reviewsPerDay: true,
          firstSessionTargetProgress: true,
        },
      })) ?? STUDY_PLAN_DEFAULTS;
    buildResult = buildQueue(cards, planUsed, new Date(), { favoritesOnly });
  }

  // totalFavorites:favoritesOnly=true 时来自 buildQueue 的累加
  // (与 queue 过滤口径一致);isCram 模式不调 buildQueue,直接数
  // prisma 已过滤的 cards 数组。
  const totalFavorites = isCram
    ? cards.filter((c) => c.isFavorite).length
    : (buildResult?.favoritesCount ?? 0);

  if (isCram) {
    // Cram 模式:全卡片顺序复习,跳过 FSRS cap 与 due 过滤
    queueItems = cards.map((c) => ({
      cardId: c.id,
      type: c.type,
      frontContent: c.frontContent,
      backContent: c.backContent,
      typeData: c.typeData,
      isFavorite: c.isFavorite,
      // Phase 08-02: per-card FSRS 6 progress (0-1 float) for
      // the top-of-card hairline bar.
      progress: c.progress,
      isNew: !c.cardState || c.cardState.state === "new",
    }));
  } else {
    queueItems = buildResult!.queue.map((item) => ({
      cardId: item.cardId,
      type: item.type,
      frontContent: item.frontContent,
      backContent: item.backContent,
      // join 一下 typeData(已经在内存的 cards 里有)
      typeData: cards.find((c) => c.id === item.cardId)?.typeData ?? null,
      // Phase 7-03: project isFavorite for the toolbar Heart button
      isFavorite:
        cards.find((c) => c.id === item.cardId)?.isFavorite ?? false,
      // Phase 08-02: same progress lookup; falls back to 0 if the
      // card isn't in the joined set (defensive — shouldn't happen
      // since the queue is built from these same cards).
      progress: cards.find((c) => c.id === item.cardId)?.progress ?? 0,
      isNew: (() => {
        const cs = cards.find((c) => c.id === item.cardId)?.cardState;
        return !cs || cs.state === "new";
      })(),
    }));
    totalCounts = {
      newCount: buildResult!.newCount,
      learnCount: buildResult!.learnCount,
      reviewCount: buildResult!.reviewCount,
    };
  }

  // 4. 队列为空 -> 空状态。favoritesOnly=true 时切到"收藏空"语义,
  //    主 CTA 变成"退出收藏模式"(链回普通 study URL),secondary
  //    CTA 保留"立刻复习全部"以应对临时想 cram 全部的情况。
  if (queueItems.length === 0) {
    return (
      <main className="mx-auto max-w-reading space-y-6 px-4 py-12 md:px-6 md:py-14">
        <div className="space-y-2">
          <Link
            href={`/decks/${deck.id}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <span aria-hidden>←</span>
            <span className="ml-1">返回牌组</span>
          </Link>
          <ZhTitle zh={deck.title} en="STUDY" size="h1" />
        </div>

        <div className="glass-card space-y-5 rounded-xl border-dashed px-6 py-16 text-center">
          <div className="space-y-2">
            <p className="text-base text-muted-foreground">
              {favoritesOnly
                ? "暂无收藏可复习。"
                : "今日没有待学习的卡片。"}
            </p>
            {favoritesOnly ? (
              <p className="font-mono text-xs text-muted-foreground/60">
                去卡组把想要常复习的卡片标为收藏,即可在此快速复习。
              </p>
            ) : null}
            <p className="font-mono text-xs text-muted-foreground/60">
              new {totalCounts.newCount} · learning {totalCounts.learnCount} ·
              review {totalCounts.reviewCount}
            </p>
          </div>

          <div className="flex flex-col items-center gap-2 pt-2 sm:flex-row sm:justify-center">
            {favoritesOnly ? (
              <>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href={`/decks/${deck.id}/study`}>退出收藏模式</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  <Link href={`/decks/${deck.id}/study?mode=cram`}>
                    立刻复习全部 {cards.length} 张
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={`/decks/${deck.id}/study?mode=cram`}>
                  立刻复习全部 {cards.length} 张
                </Link>
              </Button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // 5. 队列非空 -> 进入客户端学习会话
  return (
    <main className="mx-auto max-w-reading space-y-6 px-4 py-8 md:px-6 md:py-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/decks/${deck.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          <span className="ml-1">返回牌组</span>
        </Link>
        <div className="flex items-center gap-2">
          {isCram ? (
            <Badge variant="secondary" className="font-mono text-xs">
              CRAM
            </Badge>
          ) : null}
          {favoritesOnly ? (
            <Badge variant="secondary" className="font-mono text-xs">
              FAVORITES
            </Badge>
          ) : null}
          <div className="font-mono text-xs text-muted-foreground">
            {deck.title}
          </div>
        </div>
      </div>

      <StudySession
        deckId={deck.id}
        mode={isCram ? "cram" : "normal"}
        initialQueue={queueItems}
        favoritesOnly={favoritesOnly}
        totalFavorites={totalFavorites}
        ratingButtons={ratingButtons}
        treatRememberAsEasyOnNew={treatRememberAsEasyOnNew}
        showNextReviewTime={showNextReviewTime}
        autoRevealCloze={autoRevealCloze}
      />
    </main>
  );
}
