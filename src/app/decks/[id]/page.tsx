import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ZhTitle } from "@/components/typography/zh-title";
import { ProgressBar } from "@/components/ui/progress";
import { ProgressBadge } from "@/components/ui/progress-badge";
import { buildQueue, STUDY_PLAN_DEFAULTS } from "@/lib/fsrs";
import { CardList } from "./cards/card-list";
import { CardGallery } from "./cards/card-gallery";
import { bucketCardStates, sampleRetention } from "@/lib/stats";
import { DonutChart } from "@/components/stats/donut-chart";
import { RetentionCurve } from "@/components/stats/retention-curve";

interface DeckDetailPageProps {
  params: Promise<{ id: string }>;
  // Next.js 15.5.4: `searchParams` is a Promise. We await it before
  // reading the `view` switch (gallery vs. row list).
  searchParams: Promise<{ view?: string }>;
}

export default async function DeckDetailPage({
  params,
  searchParams,
}: DeckDetailPageProps) {
  const { id } = await params;
  const { view } = await searchParams;
  const userId = await requireUserId();
  // Anything other than the literal "list" is the gallery default.
  const useListView = view === "list";

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    include: {
      _count: { select: { cards: true } },
      cards: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          type: true,
          frontContent: true,
          backContent: true,
          isFavorite: true,
          suspended: true,
          // Needed by the gallery tile footer ("qa · 2026/6/7").
          updatedAt: true,
          // Needed by the CardDetailModal: choice options + answer
          // index, multi_choice answers array, fill answers, judge
          // correct flag, etc. The modal parses this client-side
          // via cardTypeDataSchema.
          typeData: true,
        },
      },
    },
  });
  if (!deck) notFound();

  // Phase 7: 顺手算一下今日待学数,渲染 hero CTA 副标。
  // 服务端开销很低(同 deck 已经在内存里),避免客户端再 fetch。
  // Cram 数量:全部非暂停卡片(忽略 StudyPlan cap)。
  const activeCards = deck.cards.filter((c) => !c.suspended);
  const studyPlan =
    (await prisma.studyPlan.findUnique({
      where: { deckId: id },
      select: { newPerDay: true, reviewsPerDay: true },
    })) ?? STUDY_PLAN_DEFAULTS;

  // buildQueue 需要 cardState join;deck.cards 不含 cardState,所以再查一次。
  // (生产环境可考虑在 deck 查询里 include cardState —— 但 deck.cards 选择
  // 是为画廊,只取展示字段,加 cardState 会让所有卡片多 join 一次。当前
  // 只对非暂停的子集查,体积更小。)
  const cardsWithState = await prisma.card.findMany({
    where: { deckId: id, suspended: false },
    include: { cardState: true },
  });
  const queueResult = buildQueue(cardsWithState, studyPlan, new Date());
  const todayCount = queueResult.queue.length;
  const cramCount = activeCards.length;

  // Phase 08-03: deck-level mean progress (0-1 float). Computed
  // client-side from the joined Card.progress column; the @@index
  // ([deckId, progress]) on Card keeps this O(active cards). A
  // brand-tinted badge surfaces the number on the right.
  const meanProgress =
    cardsWithState.length === 0
      ? 0
      : cardsWithState.reduce((acc, c) => acc + c.progress, 0) /
        cardsWithState.length;

  // Phase 09 (STATS-02 / STATS-03): deck-scoped statistics reuse the same
  // cardsWithState join above (no extra query, F3). Distribution buckets and
  // average stability are computed in-memory, mirroring meanProgress.
  const deckDistribution = bucketCardStates(cardsWithState);
  const deckStabilities = cardsWithState
    .map((c) => c.cardState)
    .filter((s): s is NonNullable<typeof s> => s != null && s.state !== "new")
    .map((s) => s.stability)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const deckAvgStability =
    deckStabilities.length === 0
      ? null
      : deckStabilities.reduce((acc, v) => acc + v, 0) / deckStabilities.length;
  const deckRetention = sampleRetention(deckAvgStability ?? 0);

  return (
    <main className="mx-auto max-w-content space-y-4 px-4 py-12 md:px-6 md:py-14">
      <div className="space-y-2">
        <Link
          href="/decks"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          <span className="ml-1">返回牌组列表</span>
        </Link>
        <ZhTitle zh={deck.title} en="DECK" size="h1" />
      </div>

      {/*
        Phase 7 hero CTA:大号"开始学习"按钮 + 今日待学计数 + 次级"立刻复习"链接。
        设计意图:让"开始学习"成为首屏第一视觉焦点(brand 色填充 + h-12)，
        立刻复习作为次级 ghost 链接(适合"今日队列已空但还有时间"场景)。
      */}
      <Card className="glass-card border-brand/30">
        <CardContent className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="space-y-1">
            <p className="eyebrow text-brand">学习</p>
            <p className="text-lg font-medium leading-tight">
              今日待学{" "}
              <span className="font-display text-2xl text-foreground">
                {todayCount}
              </span>{" "}
              张
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              new {queueResult.newCount} · learning {queueResult.learnCount} ·
              review {queueResult.reviewCount}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-12 w-full px-8 text-base font-medium sm:w-auto"
              disabled={todayCount === 0 && cramCount === 0}
            >
              <Link href={`/decks/${deck.id}/study`} prefetch>
                {todayCount > 0 ? "开始学习" : "无卡可学"}
              </Link>
            </Button>
            {cramCount > 0 ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground sm:w-auto"
              >
                <Link
                  href={`/decks/${deck.id}/study?mode=cram`}
                  prefetch
                >
                  立刻复习全部 {cramCount} 张 →
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          {deck.description ? (
            <CardDescription className="whitespace-pre-wrap">
              {deck.description}
            </CardDescription>
          ) : (
            <CardDescription className="text-muted-foreground/60">
              （无描述）
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{deck._count.cards} 张卡片</p>
          <div className="grid grid-cols-1 gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
            <p>创建于 {new Date(deck.createdAt).toLocaleString("zh-CN")}</p>
            <p>更新于 {new Date(deck.updatedAt).toLocaleString("zh-CN")}</p>
          </div>
        </CardContent>
      </Card>

      {/*
        Phase 08-03: deck-level mean progress. 1px hairline +
        tabular-nums badge. Brand color does the work; the label
        stays calm. Anchors users to the FSRS 6 mental model: 0
        = brand new, 100 = fully stable.
      */}
      <Card className="glass-card">
        <CardContent className="space-y-3 px-6 py-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">平均学习进度</p>
            <ProgressBadge
              value={meanProgress}
              label={`${cardsWithState.length} 张卡`}
            />
          </div>
          <ProgressBar
            value={meanProgress}
            variant="subtle"
            aria-label="牌组平均学习进度"
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            FSRS 6 · 0 = 新卡 · 100 = 已稳定
          </p>
        </CardContent>
      </Card>

      {/* Phase 09: 学习统计 区块 - 卡状态分布环形图 + 牌组记忆曲线 (D-15 内嵌) */}
      <section className="space-y-l">
        <ZhTitle zh="学习统计" en="DECK STATISTICS" size="h2" as="h2" />
        <div className="grid gap-l md:grid-cols-2">
          <DonutChart distribution={deckDistribution} deckId={deck.id} />
          <RetentionCurve data={deckRetention} avgStability={deckAvgStability} />
        </div>
      </section>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-s text-sm text-muted-foreground">
            <span>{useListView ? "列表视图" : "画廊视图"}</span>
            <Button asChild variant="ghost" size="sm">
              <Link
                href={
                  useListView
                    ? `/decks/${deck.id}`
                    : `/decks/${deck.id}?view=list`
                }
              >
                {useListView ? "切换到画廊视图" : "切换到列表视图"}
              </Link>
            </Button>
          </div>
          <CardTitle>卡片列表</CardTitle>
          <CardDescription>{deck.cards.length} 张卡片</CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            The key remounts the client component on toggle so the
            filter state resets cleanly between the two views. Without
            it, switching from list to gallery would carry over the
            search input from the row view.
          */}
          {useListView ? (
            <CardList
              key="list"
              deckId={deck.id}
              cards={deck.cards}
            />
          ) : (
            <CardGallery
              key="gallery"
              deckId={deck.id}
              cards={deck.cards}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild>
          <Link href={`/decks/${deck.id}/cards/new`} prefetch>
            + 新建卡片
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            href={`/decks/${deck.id}/settings?import=1#batch-import`}
            prefetch
          >
            批量导入卡片
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/decks/${deck.id}/settings`} prefetch>
            进入设置
          </Link>
        </Button>
        {/*
          "开始学习" 主入口已搬到页头 hero CTA(更显眼)。
          这里留三个次级动作:新建卡片 + 批量导入 + 设置。
        */}
      </div>
    </main>
  );
}
