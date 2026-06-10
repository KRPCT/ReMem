"use client";

import { cn } from "@/lib/utils";

/**
 * Phase 08-03: reusable progress bar.
 *
 * 1px hairline, brand-colored fill, no filled track — a filled
 * track is a banned LLM tell ("scoring bar" anti-pattern) that
 * the project's design taste rules call out explicitly. The user
 * reads the bar as "this is the proportion" rather than "this is
 * how full the queue is".
 *
 * Visual variants:
 *   - default: 8px tall, brand fill, standard use in Cards
 *   - subtle: 4px tall, brand/60 fill, used inside dense rows
 *   - hairline: 1px tall, brand fill, used as section divider
 *
 * Data attributes: data-pct (low | mid | high) — derived from the
 * value. Consumers can target this in CSS to color the fill
 * differently (e.g. red below 25%). The component itself does
 * not switch colors — that would be a brand-inconsistency.
 *
 * A11y: the bar is a real progressbar role with aria-valuenow /
 * min / max. Use aria-label to describe what the value represents
 * ("平均学习进度" / "本卡学习进度" / etc.).
 */
export type ProgressVariant = "default" | "subtle" | "hairline";

export interface ProgressBarProps {
  /** 0-1 浮点,自动 clamp */
  value: number;
  /** 视觉变体 */
  variant?: ProgressVariant;
  /** aria-label for the progressbar role */
  "aria-label"?: string;
  className?: string;
}

const VARIANT_TO_TRACK: Record<ProgressVariant, string> = {
  default: "h-2",
  subtle: "h-1",
  hairline: "h-px",
};

export function ProgressBar({
  value,
  variant = "default",
  className,
  "aria-label": ariaLabel,
}: ProgressBarProps) {
  // Clamp to [0, 1] so a backend / DB regression never renders
  // a "negative" or ">100%" bar. Math.max with a finite upper
  // bound handles NaN defensively (NaN < x is always false, so
  // Math.min(1, NaN) would return NaN — guard with the isFinite
  // check).
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const pct = safe * 100;
  const band =
    safe < 0.25 ? "low" : safe < 0.75 ? "mid" : "high";

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      data-pct={band}
      className={cn(
        "w-full overflow-hidden rounded-full bg-border",
        VARIANT_TO_TRACK[variant],
        className
      )}
    >
      <div
        className={cn(
          "h-full bg-brand transition-[width] duration-300 ease-out",
          variant === "hairline" ? "h-px" : null
        )}
        style={{ width: `${pct}%` }}
        data-testid="progress-bar-fill"
      />
    </div>
  );
}
