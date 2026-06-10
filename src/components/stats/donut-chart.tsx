"use client";

/**
 * Phase 09 (STATS-03): card-state distribution donut (Recharts PieChart).
 *
 * Slice colors are resolved from design-token CSS variables at runtime via
 * getComputedStyle (UI-SPEC § Chart Series Color Contract) and passed to
 * Recharts as concrete `hsl(...)` strings; the project has no shadcn color
 * Tailwind mapping and SVG attributes do not resolve `var()`. A
 * MutationObserver re-reads on theme switch; animation is disabled under
 * prefers-reduced-motion. Two empty states (no cards / cards but no study).
 * No em-dash in any visible string.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ZhCaption } from "@/components/typography/zh-caption";
import type { CardStateDistribution } from "@/lib/stats";

const FALLBACK = {
  muted: "240 5% 56%",
  brand: "162 45% 58%",
  destructive: "0 84% 60%",
};

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function readTokens() {
  return {
    muted: readVar("--muted-foreground", FALLBACK.muted),
    brand: readVar("--color-brand-background", FALLBACK.brand),
    destructive: readVar("--destructive", FALLBACK.destructive),
  };
}

interface DonutSlice {
  key: string;
  name: string;
  value: number;
  /** Resolved hsl() string for the Recharts SVG <Cell> fill (client-only). */
  color: string;
  /**
   * CSS-var color string for the SSR-rendered DOM legend swatch. Using
   * `hsl(var(--...))` directly (not a getComputedStyle-resolved value) keeps
   * the server HTML and the client's first render identical, avoiding a
   * hydration mismatch — and it stays theme-reactive for free.
   */
  legendColor: string;
  percent: number;
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DonutSlice }>;
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div
      className="rounded-md border px-2.5 py-1 text-sm font-medium shadow-md"
      style={{
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        borderColor: "hsl(var(--border))",
      }}
    >
      {s.name}: {s.value} 张 ({s.percent}%)
    </div>
  );
}

export interface DonutChartProps {
  distribution: CardStateDistribution;
  deckId: string;
}

export function DonutChart({ distribution, deckId }: DonutChartProps) {
  const [tokens, setTokens] = useState(readTokens);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setTokens(readTokens());
    const mo = new MutationObserver(() => setTokens(readTokens()));
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const { new: newCount, learning, review, lapsed, total } = distribution;
  const studied = learning + review + lapsed;

  // Empty state 1: deck has no cards at all.
  if (total === 0) {
    return (
      <EmptyDonut
        heading="这个牌组还没有卡片"
        body="添加卡片后可查看学习状态分布"
        ctaLabel="+ 新建卡片"
        ctaHref={`/decks/${deckId}/cards/new`}
      />
    );
  }
  // Empty state 2: cards exist but none have been studied yet.
  if (studied === 0) {
    return (
      <EmptyDonut
        heading="暂无学习数据"
        body="开始学习后这里会显示卡片状态分布"
        ctaLabel="开始学习这个牌组"
        ctaHref={`/decks/${deckId}/study`}
      />
    );
  }

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const slices: DonutSlice[] = [
    { key: "new", name: "新卡", value: newCount, color: `hsl(${tokens.muted})`, legendColor: "hsl(var(--muted-foreground))", percent: pct(newCount) },
    { key: "learning", name: "学习中", value: learning, color: `hsl(${tokens.brand} / 0.30)`, legendColor: "hsl(var(--color-brand-background) / 0.30)", percent: pct(learning) },
    { key: "review", name: "已记住", value: review, color: `hsl(${tokens.brand})`, legendColor: "hsl(var(--color-brand-background))", percent: pct(review) },
    { key: "lapsed", name: "遗忘", value: lapsed, color: `hsl(${tokens.destructive})`, legendColor: "hsl(var(--destructive))", percent: pct(lapsed) },
  ];

  return (
    <Card>
      <CardContent className="space-y-l p-6">
        <ZhCaption zh="卡状态分布" en="CARD DISTRIBUTION" />

        <div className="relative">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Tooltip content={<DonutTooltip />} />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={80}
                stroke="none"
                isAnimationActive={!reduceMotion}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-semibold leading-none">
              {total}
            </span>
            <span className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              张卡
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-m font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {slices.map((s) => (
            <span key={s.key} className="flex items-center gap-xs">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: s.legendColor }}
              />
              {s.name} {s.value}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyDonut({
  heading,
  body,
  ctaLabel,
  ctaHref,
}: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-l p-6">
        <ZhCaption zh="卡状态分布" en="CARD DISTRIBUTION" />
        <div
          className="rounded-xl border border-dashed px-6 py-12 text-center"
          style={{ borderColor: "hsl(var(--border) / 0.6)" }}
        >
          <p className="text-sm font-medium text-foreground">{heading}</p>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          <Button asChild size="lg" className="mt-4 h-11">
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
