"use client";

/**
 * Phase 09 (STATS-02): FSRS memory-retention curve (Recharts AreaChart).
 *
 * Series colors are resolved from the design-token CSS variables at runtime
 * via getComputedStyle (UI-SPEC § Chart Series Color Contract) and passed to
 * Recharts as concrete `hsl(...)` strings, because the project has no shadcn
 * color Tailwind mapping and SVG presentation attributes do not resolve `var()`.
 * A MutationObserver re-reads them on theme switch. Recharts animation is
 * disabled under prefers-reduced-motion. No em-dash in any visible string.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ZhCaption } from "@/components/typography/zh-caption";
import type { RetentionPoint } from "@/lib/stats";

const FALLBACK = { brand: "162 45% 58%", fg3: "240 5% 56%", fg4: "240 5% 43%" };

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function readTokens() {
  return {
    brand: readVar("--color-brand-background", FALLBACK.brand),
    fg3: readVar("--color-neutral-foreground-3", FALLBACK.fg3),
    fg4: readVar("--color-neutral-foreground-4", FALLBACK.fg4),
  };
}

interface CurveTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: RetentionPoint }>;
}

function CurveTooltip({ active, payload }: CurveTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="rounded-md border px-2.5 py-1 text-sm font-medium shadow-md"
      style={{
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        borderColor: "hsl(var(--border))",
      }}
    >
      {p.day}天后: {(p.retention * 100).toFixed(1)}%
    </div>
  );
}

export interface RetentionCurveProps {
  data: RetentionPoint[];
  avgStability: number | null;
}

export function RetentionCurve({ data, avgStability }: RetentionCurveProps) {
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

  const isEmpty = data.length === 0 || avgStability == null || avgStability <= 0;

  const stroke = `hsl(${tokens.brand})`;
  const fill = `hsl(${tokens.brand} / 0.15)`;
  const axis = `hsl(${tokens.fg3})`;
  const refLine = `hsl(${tokens.fg4})`;

  return (
    <Card>
      <CardContent className="space-y-l p-6">
        <ZhCaption zh="记忆留存曲线" en="RETENTION CURVE" />

        {isEmpty ? (
          <div
            className="rounded-xl border border-dashed px-6 py-12 text-center"
            style={{ borderColor: "hsl(var(--border) / 0.6)" }}
          >
            <p className="text-sm font-medium text-foreground">暂无记忆数据</p>
            <p className="mt-1 text-sm text-muted-foreground">
              完成第一次复习后自动生成
            </p>
            <Button asChild size="lg" className="mt-4 h-11">
              <Link href="/decks">去复习卡片</Link>
            </Button>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={data}
                margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
              >
                <XAxis
                  dataKey="day"
                  type="number"
                  domain={[0, 60]}
                  ticks={[0, 10, 20, 30, 40, 50, 60]}
                  tick={{ fill: axis, fontSize: 11 }}
                  stroke={axis}
                  label={{
                    value: "天数 (days)",
                    position: "insideBottom",
                    offset: -2,
                    fontSize: 11,
                    fill: axis,
                  }}
                />
                <YAxis
                  domain={[0, 1]}
                  ticks={[0, 0.25, 0.5, 0.75, 1]}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  tick={{ fill: axis, fontSize: 11 }}
                  stroke={axis}
                  width={40}
                  label={{
                    value: "留存率",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 11,
                    fill: axis,
                  }}
                />
                <ReferenceLine
                  y={0.9}
                  stroke={refLine}
                  strokeDasharray="4 4"
                  label={{ value: "90%", position: "right", fontSize: 11, fill: refLine }}
                />
                <Tooltip content={<CurveTooltip />} cursor={{ stroke: refLine }} />
                <Area
                  type="monotone"
                  dataKey="retention"
                  stroke={stroke}
                  strokeWidth={2}
                  fill={fill}
                  isAnimationActive={!reduceMotion}
                />
              </AreaChart>
            </ResponsiveContainer>
            {avgStability != null && avgStability > 0 && (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                平均稳定性 {Math.round(avgStability)} 天
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
