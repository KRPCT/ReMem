import { cn } from "@/lib/utils";

/**
 * Phase 08-03: compact percentage badge.
 *
 * "73%" style label for tight UI rows (deck mean progress on
 * /decks/[id], per-card progress on /decks/[id]/cards/[cardId]).
 * JetBrains Mono (font-mono) for the digits + uppercase eyebrow
 * tracking for the surrounding context, matching the project's
 * "small caps mono labels" pattern.
 *
 * The badge is purely presentational; the ProgressBar carries
 * the real a11y semantics (aria-valuenow, role). The badge is
 * there to surface the number in dense layouts where a 8px-tall
 * bar would be hard to read.
 */
export interface ProgressBadgeProps {
  /** 0-1 浮点 */
  value: number;
  /** Optional label rendered to the left of the percent */
  label?: string;
  /** Tone override — defaults derive from data-pct (low/mid/high) */
  tone?: "default" | "muted" | "brand";
  className?: string;
}

export function ProgressBadge({
  value,
  label,
  tone,
  className,
}: ProgressBadgeProps) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const pct = safe * 100;
  const band =
    safe < 0.25 ? "low" : safe < 0.75 ? "mid" : "high";
  // Auto-tone from band, but allow override (e.g. always brand
  // for a "boost" badge that should pop even at low values).
  const effectiveTone =
    tone ??
    (band === "low"
      ? "muted"
      : band === "mid"
      ? "default"
      : "brand");

  return (
    <span
      data-pct={band}
      data-tone={effectiveTone}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.18em]",
        effectiveTone === "muted" && "text-muted-foreground",
        effectiveTone === "default" && "text-foreground",
        effectiveTone === "brand" && "text-brand",
        className
      )}
    >
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <span
        className="tabular-nums"
        data-testid="progress-badge-value"
      >
        {Math.round(pct)}%
      </span>
    </span>
  );
}
