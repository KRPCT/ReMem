"use client";

/**
 * Phase 09 (STATS-01): GitHub-contributions-style review heatmap.
 *
 * Self-drawn CSS grid (no calendar library): 53 week-columns x 7 day-rows,
 * oldest column left, today right. Cell colors come from the 5-tier
 * --stats-heat-* tokens via inline `hsl(var(--...))` (the project has no
 * shadcn color Tailwind mapping, so token colors are applied inline).
 *
 * Responsive: >=1024px shows the full 53 weeks; below that, the last 26
 * weeks in a horizontally-scrollable container (cells never shrink).
 * Hover shows a tooltip; no click interaction (D-04). Empty state renders
 * the gray tier-0 grid as a decorative backdrop with a guiding overlay.
 */
import { useRef, useState, type MouseEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ZhCaption } from "@/components/typography/zh-caption";
import { HeatmapTooltip } from "./heatmap-tooltip";
import type { HeatmapDay } from "@/lib/stats";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
// Row order is Sun..Sat; label only Mon (1) / Wed (3) / Fri (5).
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MOBILE_DAYS = 182; // last 26 weeks

const CELL_BOX = "h-[var(--stats-heatmap-cell)] w-[var(--stats-heatmap-cell)]";
const LABEL = "font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground";

interface Week {
  days: (HeatmapDay | null)[];
  monthLabel: string | null;
}

interface Hovered {
  label: string;
  x: number;
  y: number;
}

function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function tier(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 8) return 2;
  if (count <= 15) return 3;
  return 4;
}

function formatLabel(day: HeatmapDay): string {
  const [y, m, d] = day.date.split("-").map(Number);
  const date = `${y}年${m}月${d}日`;
  return day.count > 0 ? `${date} · 复习 ${day.count} 次` : `${date} · 暂无复习`;
}

/** Group ordered days into week-columns (Sun-start), with month labels. */
function toWeeks(data: HeatmapDay[]): Week[] {
  const cols: (HeatmapDay | null)[][] = [];
  let col: (HeatmapDay | null)[] = [];
  data.forEach((day, i) => {
    const dow = parseLocal(day.date).getDay();
    if (i === 0) {
      for (let p = 0; p < dow; p++) col.push(null);
    } else if (dow === 0) {
      cols.push(col);
      col = [];
    }
    col.push(day);
  });
  if (col.length) {
    while (col.length < 7) col.push(null);
    cols.push(col);
  }

  let prevMonth = -1;
  return cols.map((days) => {
    const first = days.find((d): d is HeatmapDay => d !== null);
    let monthLabel: string | null = null;
    if (first) {
      const mo = parseLocal(first.date).getMonth();
      if (mo !== prevMonth) {
        monthLabel = MONTHS[mo];
        prevMonth = mo;
      }
    }
    return { days, monthLabel };
  });
}

export interface ReviewHeatmapProps {
  data: HeatmapDay[];
}

export function ReviewHeatmap({ data }: ReviewHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const hasData = data.some((d) => d.count > 0);
  const todayKey = data.length ? data[data.length - 1].date : "";
  const fullWeeks = toWeeks(data);
  const mobileWeeks = toWeeks(data.slice(-MOBILE_DAYS));

  function onCellEnter(day: HeatmapDay, e: MouseEvent<HTMLDivElement>) {
    if (!hasData || !containerRef.current) return;
    const cell = e.currentTarget.getBoundingClientRect();
    const box = containerRef.current.getBoundingClientRect();
    setHovered({
      label: formatLabel(day),
      x: cell.left - box.left + cell.width / 2,
      y: cell.top - box.top,
    });
  }

  function renderGrid(weeks: Week[]) {
    return (
      <div className="inline-flex flex-col gap-xs">
        {/* month labels above the columns */}
        <div className="flex gap-xs pl-6">
          {weeks.map((w, i) => (
            <div
              key={i}
              className={`${CELL_BOX} relative shrink-0 overflow-visible whitespace-nowrap leading-none ${LABEL}`}
            >
              {w.monthLabel}
            </div>
          ))}
        </div>
        {/* day-label column + week columns */}
        <div className="flex gap-xs">
          <div className="flex w-6 shrink-0 flex-col gap-xs">
            {DAY_LABELS.map((label, row) => (
              <div
                key={row}
                className="flex h-[var(--stats-heatmap-cell)] items-center justify-end pr-1 font-mono text-[9px] uppercase leading-none tracking-tight text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          {weeks.map((week, ci) => (
            <div key={ci} className="flex shrink-0 flex-col gap-xs">
              {week.days.map((day, row) => {
                if (!day) {
                  return <div key={row} className={`${CELL_BOX} shrink-0`} />;
                }
                const isToday = day.date === todayKey;
                return (
                  <div
                    key={row}
                    role="img"
                    aria-label={`${day.date} 复习 ${day.count} 次`}
                    onMouseEnter={(e) => onCellEnter(day, e)}
                    onMouseLeave={() => setHovered(null)}
                    className={`${CELL_BOX} shrink-0 transition-opacity hover:opacity-80`}
                    style={{
                      backgroundColor: `hsl(var(--stats-heat-${tier(day.count)}))`,
                      borderRadius: "var(--radius-sm)",
                      boxShadow: isToday
                        ? "0 0 0 1.5px hsl(var(--color-brand-background))"
                        : undefined,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-l p-6">
        <ZhCaption zh="复习热力图" en="REVIEW HEATMAP" />

        <div ref={containerRef} className="relative">
          <div
            role="grid"
            aria-label="过去365天复习热力图"
            className={hasData ? "" : "opacity-60"}
          >
            <div
              className="hidden overflow-x-auto lg:block"
              style={{ scrollbarWidth: "thin" }}
            >
              {renderGrid(fullWeeks)}
            </div>
            <div
              className="overflow-x-auto lg:hidden"
              style={{ scrollbarWidth: "thin" }}
            >
              {renderGrid(mobileWeeks)}
            </div>
          </div>

          {hovered && (
            <HeatmapTooltip label={hovered.label} x={hovered.x} y={hovered.y} />
          )}

          {!hasData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-card/40 px-6 text-center">
              <p className="text-sm font-medium text-foreground">
                开始学习后这里会亮起来
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                你的每一次复习都会在这里留下印记
              </p>
            </div>
          )}
        </div>

        {/* legend: 少 -> 多 */}
        <div className={`flex items-center gap-xs ${LABEL}`}>
          <span>少</span>
          {[0, 1, 2, 3, 4].map((t) => (
            <span
              key={t}
              className={CELL_BOX}
              style={{
                backgroundColor: `hsl(var(--stats-heat-${t}))`,
                borderRadius: "var(--radius-sm)",
              }}
            />
          ))}
          <span>多</span>
        </div>
      </CardContent>
    </Card>
  );
}
