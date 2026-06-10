"use client";

import { CARD_TYPES, type CardType } from "@/lib/validation";
import { cn } from "@/lib/utils";

const LABELS: Record<CardType, { zh: string; en: string; hint: string }> = {
  choice: { zh: "选择题", en: "CHOICE", hint: "单选，2 个以上选项" },
  multi_choice: { zh: "多选题", en: "MULTI", hint: "多选，至少 1 个正确答案" },
  fill: { zh: "填空题", en: "FILL", hint: "接受多个等价答案" },
  qa: { zh: "问答题", en: "QA", hint: "用户自评 Again / Hard / Good / Easy" },
  judge: { zh: "判断题", en: "JUDGE", hint: "对 / 错 二元判断" },
};

/**
 * Shared type-cell component used in two layouts:
 *
 * - `layout="stacked"` — 5 cells in a responsive grid; each cell is
 *   128 px tall and shows the Chinese name, an English mono caption,
 *   and a one-line hint. Reserved for future preview / picker pages.
 *
 * - `layout="inline"` — the in-form switcher rendered inside
 *   `<CardForm>`. Cells are 44 px tall (touch target), laid out as a
 *   5-column grid, show just the Chinese name. Active cell uses the
 *   brand color directly so it reads as the current selection.
 */
export interface CardTypeSegmentedProps {
  value: CardType | null;
  onChange: (t: CardType) => void;
  layout?: "stacked" | "inline";
}

export function CardTypeSegmented({
  value,
  onChange,
  layout = "stacked",
}: CardTypeSegmentedProps) {
  if (layout === "inline") {
    return (
      <div
        role="radiogroup"
        aria-label="题型"
        className="grid grid-cols-5 gap-s"
      >
        {CARD_TYPES.map((t) => {
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(t)}
              className={cn(
                // 44px on mobile (WCAG / Apple HIG tap target), 48px on
                // md+ for visual proportion when the form is wider.
                "h-11 md:h-12 w-full rounded-xl border text-center text-xs md:text-sm font-medium transition-all inline-flex items-center justify-center",
                // Active: frosted glass surface + brand border + brand
                // text. The translucent card lets the page gradient
                // peek through, which is a much stronger "selected"
                // affordance than a solid brand fill (and avoids the
                // low-contrast solid-on-solid feeling).
                active
                  ? "glass-card border-brand text-brand shadow-inner"
                  : "border-border bg-card/40 text-foreground hover:border-brand hover:bg-card/60"
              )}
            >
              {LABELS[t].zh}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-m sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {CARD_TYPES.map((t) => (
        <SegmentedCell
          key={t}
          type={t}
          active={value === t}
          onClick={() => onChange(t)}
        />
      ))}
    </div>
  );
}

interface SegmentedCellProps {
  type: CardType;
  active: boolean;
  onClick: () => void;
}

function SegmentedCell({ type, active, onClick }: SegmentedCellProps) {
  const label = LABELS[type];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`选择${label.zh}`}
      aria-pressed={active}
      className={cn(
        "h-32 rounded-xl border p-l text-left transition-all",
        // Active: frosted glass + brand border — the translucent
        // surface reveals the body bg gradient, which is a stronger
        // "selected" affordance than the prior solid brand-subtle.
        active
          ? "glass-card border-brand"
          : "border-border bg-card/40 hover:border-brand hover:bg-card/60"
      )}
    >
      <div className="text-fluid-h2">{label.zh}</div>
      <div className="mt-1 font-mono text-xs uppercase tracking-wide text-brand">
        {label.en}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{label.hint}</p>
    </button>
  );
}
