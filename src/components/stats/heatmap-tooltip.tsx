"use client";

/**
 * Phase 09 (STATS-01): hover tooltip for a heatmap cell.
 *
 * Background/border are set inline via `hsl(var(--card))` / `hsl(var(--border))`
 * because this project has no shadcn color Tailwind mapping (`bg-card` is a
 * no-op here); an overlay must paint its own surface so it floats above the
 * grid (CLAUDE.md overlay rule, honored functionally). Text is 14px body tier.
 * Copy uses the middle dot `·`, never an em-dash.
 */
export interface HeatmapTooltipProps {
  /** Pre-formatted label, e.g. "2026年6月9日 · 复习 3 次". */
  label: string;
  /** Position in px, relative to the grid container. */
  x: number;
  y: number;
}

export function HeatmapTooltip({ label, x, y }: HeatmapTooltipProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border px-2.5 py-1 text-sm font-medium shadow-md"
      style={{
        left: x,
        top: y - 6,
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        borderColor: "hsl(var(--border))",
      }}
    >
      {label}
    </div>
  );
}
