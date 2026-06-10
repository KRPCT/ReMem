import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getReviewHeatmap, sampleRetention } from "@/lib/stats";
import type { HeatmapDay, RetentionPoint } from "@/lib/stats";
import { ReviewHeatmap } from "@/components/stats/heatmap";
import { RetentionCurveLazy } from "@/components/stats/retention-curve-lazy";
import { ZhTitle } from "@/components/typography/zh-title";
import { ZhCaption } from "@/components/typography/zh-caption";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const userId = await requireUserId();

  // Verbatim data-fetch block from src/app/page.tsx (D-06: zero new backend)
  const heatmapData: HeatmapDay[] = await getReviewHeatmap(userId);
  const stabilityRows = await prisma.cardState.findMany({
    where: { userId, NOT: { state: "new" }, card: { suspended: false } },
    select: { stability: true },
  });
  const stabilities = stabilityRows
    .map((r) => r.stability)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const globalAvgStability: number | null =
    stabilities.length === 0
      ? null
      : stabilities.reduce((acc, v) => acc + v, 0) / stabilities.length;
  const globalRetention: RetentionPoint[] = sampleRetention(globalAvgStability ?? 0);

  return (
    <main className="mx-auto max-w-content px-4 pb-20 pt-12 md:px-8 md:pt-20">
      <div className="mb-6 space-y-1">
        <ZhCaption zh="学习统计" en="STUDY STATISTICS" enFirst />
        <ZhTitle zh="学习统计" en="STUDY STATISTICS" size="h2" as="h1" />
      </div>
      <div className="grid gap-xxl animate-section-in">
        <ReviewHeatmap data={heatmapData} />
        <RetentionCurveLazy data={globalRetention} avgStability={globalAvgStability} />
      </div>
    </main>
  );
}
