"use client";

/**
 * Phase 09 / Phase 14 redesign: FSRS memory curve, two-narrative contrast.
 *
 * GREEN  ("坚持复习")  — sampleMaintainedRetention: an illustrative sawtooth that
 *   snaps back to 100% on every on-schedule review and holds high.
 * RED    ("不复习")    — sampleEnsembleRetention: the population expected recall
 *   if reviewing stops now, decaying toward 0.
 *
 * Series colors are resolved from the design-token CSS variables at runtime via
 * getComputedStyle (UI-SPEC Chart Series Color Contract) and passed to Recharts
 * as concrete `hsl(...)` strings, because the project has no shadcn color
 * Tailwind mapping and SVG presentation attributes do not resolve `var()`. A
 * MutationObserver re-reads them on theme switch. Recharts animation is disabled
 * under prefers-reduced-motion. No em-dash in any visible string.
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
import { REVIEW_TARGET_RETENTION, type RetentionPoint } from "@/lib/stats";

const FALLBACK = {
  brand: "162 45% 58%",
  destructive: "0 72% 51%",
  fg3: "240 5% 56%",
  fg4: "240 5% 43%",
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
    brand: readVar("--color-brand-background", FALLBACK.brand),
    destructive: readVar("--destructive", FALLBACK.destructive),
    fg3: readVar("--color-neutral-foreground-3", FALLBACK.fg3),
    fg4: readVar("--color-neutral-foreground-4", FALLBACK.fg4),
  };
}

interface MergedPoint {
  day: number;
  maintained: number | null;
  forgetting: number | null;
}

interface CurveTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MergedPoint }>;
}

function CurveTooltip({ active, payload }: CurveTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(0)}%`);
  return (
    <div
      className="space-y-0.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-md"
      style={{
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        borderColor: "hsl(var(--border))",
      }}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {p.day === 0 ? "新学" : `${p.day} 天后`}
      </div>
      <div style={{ color: "hsl(var(--color-brand-background))" }}>
        坚持复习 {pct(p.maintained)}
      </div>
      <div style={{ color: "hsl(var(--destructive))" }}>
        不复习 {pct(p.forgetting)}
      </div>
    </div>
  );
}

export interface RetentionCurveProps {
  /** Red baseline: population expected recall if reviewing stops now. */
  forgetting: RetentionPoint[];
  /** Green overlay: illustrative maintained-by-reviews sawtooth. */
  maintained: RetentionPoint[];
  avgStability: number | null;
  /** Adaptive x-axis max (days). */
  spanDays: number;
}

export function RetentionCurve({
  forgetting,
  maintained,
  avgStability,
  spanDays,
}: RetentionCurveProps) {
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

  const isEmpty =
    forgetting.length === 0 || avgStability == null || avgStability <= 0;

  // Merge the two same-length series into one Recharts data array.
  const merged: MergedPoint[] = forgetting.map((f, i) => ({
    day: f.day,
    forgetting: f.retention,
    maintained: maintained[i]?.retention ?? null,
  }));

  const span = Math.max(1, spanDays);
  const ticks = Array.from({ length: 7 }, (_, i) => Math.round((i * span) / 6));

  const green = `hsl(${tokens.brand})`;
  const red = `hsl(${tokens.destructive})`;
  const axis = `hsl(${tokens.fg3})`;
  const refLine = `hsl(${tokens.fg4})`;

  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-l p-6">
        <ZhCaption zh="记忆曲线" en="MEMORY CURVE" />

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
            {/* legend */}
            <div className="flex flex-wrap items-center gap-x-l gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: green }}
                />
                坚持复习
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: red }}
                />
                不复习
              </span>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={merged}
                margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
              >
                <defs>
                  <linearGradient id="curveGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={green} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={green} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="curveRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={red} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={red} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  type="number"
                  domain={[0, span]}
                  ticks={ticks}
                  tick={{ fill: axis, fontSize: 11 }}
                  stroke={axis}
                  tickFormatter={(v: number) => (v === 0 ? "新学" : `${v}天`)}
                />
                <YAxis
                  domain={[0, 1]}
                  ticks={[0, 0.25, 0.5, 0.75, 1]}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  tick={{ fill: axis, fontSize: 11 }}
                  stroke={axis}
                  width={40}
                />
                <ReferenceLine
                  y={REVIEW_TARGET_RETENTION}
                  stroke={refLine}
                  strokeDasharray="4 4"
                  label={{
                    value: "90%",
                    position: "right",
                    fontSize: 11,
                    fill: refLine,
                  }}
                />
                <Tooltip content={<CurveTooltip />} cursor={{ stroke: refLine }} />
                {/* red first so the green maintained curve layers on top */}
                <Area
                  type="monotone"
                  dataKey="forgetting"
                  stroke={red}
                  strokeWidth={2}
                  fill="url(#curveRed)"
                  connectNulls
                  isAnimationActive={!reduceMotion}
                />
                <Area
                  type="monotone"
                  dataKey="maintained"
                  stroke={green}
                  strokeWidth={2}
                  fill="url(#curveGreen)"
                  connectNulls
                  isAnimationActive={!reduceMotion}
                />
              </AreaChart>
            </ResponsiveContainer>

            {avgStability != null && avgStability > 0 && (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                平均稳定性 {Math.round(avgStability)} 天 · 红线为停止复习后的群体留存
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
