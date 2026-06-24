import Link from "next/link";
import { auth } from "../../auth";
import { prisma } from "@/lib/prisma";
import {
  adaptiveRetentionSpan,
  getReviewHeatmap,
  sampleEnsembleRetention,
  sampleMaintainedRetention,
} from "@/lib/stats";
import type { HeatmapDay, RetentionPoint } from "@/lib/stats";
import { ReviewHeatmap } from "@/components/stats/heatmap";
import { RetentionCurveLazy } from "@/components/stats/retention-curve-lazy";
import { Button } from "@/components/ui/button";
import { ZhTitle } from "@/components/typography/zh-title";

/**
 * ReMem homepage: plain tool voice. A minimal hero (title + one-line
 * factual intro + CTA) shared by logged-in / logged-out, plus the
 * 学习统计 dashboard for authenticated users.
 *
 * No marketing copy: the project is a personal study tool, not a
 * marketing site (see CLAUDE.md). Design tokens come from
 * `src/app/globals.css`; this page uses no raw color / size / spacing.
 */
export default async function HomePage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  // Logged-in dashboard data. Fetched only when authenticated; every
  // query is scoped by userId (multi-tenant).
  let heatmapData: HeatmapDay[] = [];
  let globalAvgStability: number | null = null;
  let globalForgetting: RetentionPoint[] = [];
  let globalMaintained: RetentionPoint[] = [];
  let globalSpan = adaptiveRetentionSpan(null);
  if (isLoggedIn) {
    const userId = session!.user.id;
    heatmapData = await getReviewHeatmap(userId);
    const stabilityRows = await prisma.cardState.findMany({
      where: { userId, NOT: { state: "new" }, card: { suspended: false } },
      select: { stability: true },
    });
    const stabilities = stabilityRows
      .map((r) => r.stability)
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    globalAvgStability =
      stabilities.length === 0
        ? null
        : stabilities.reduce((acc, v) => acc + v, 0) / stabilities.length;
    globalSpan = adaptiveRetentionSpan(globalAvgStability);
    globalForgetting = sampleEnsembleRetention(stabilities, globalSpan);
    globalMaintained = sampleMaintainedRetention(
      globalAvgStability ?? 0,
      globalSpan
    );
  }

  return (
    <main className="mx-auto max-w-content px-4 pb-20 pt-12 md:px-8 md:pt-20">
      {/* ============== HERO (plain, tool voice) ============== */}
      <section className="glass-card relative isolate overflow-hidden rounded-2xl px-6 py-10 md:px-12 md:py-16 animate-section-in">
        <div className="space-y-6">
          <ZhTitle zh="间隔重复学习" en="SPACED REPETITION" size="h1" />
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            闪卡复习工具，采用基于 FSRS 改进的间隔重复算法，Markdown 写卡，支持多种题型。
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:gap-3">
            {isLoggedIn ? (
              <>
                <Button asChild size="lg" className="rounded-full">
                  <Link href="/decks">开始今日学习</Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground"
                >
                  <Link href="/decks">查看我的牌组</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg" className="rounded-full">
                  <Link href="/register">开始学习</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full">
                  <Link href="/login">已有账户</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ===== AUTH-AWARE: 学习统计 (logged in, right below the hero) ===== */}
      {isLoggedIn && (
        <section className="mt-16 md:mt-20 animate-section-in animate-section-in-delay-1">
          <ZhTitle zh="学习统计" en="STUDY STATISTICS" size="h2" as="h2" />
          <div className="mt-6 grid gap-xxl">
            <ReviewHeatmap data={heatmapData} />
            <RetentionCurveLazy
              forgetting={globalForgetting}
              maintained={globalMaintained}
              avgStability={globalAvgStability}
              spanDays={globalSpan}
            />
          </div>
        </section>
      )}
    </main>
  );
}
