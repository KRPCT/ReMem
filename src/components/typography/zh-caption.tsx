import { cn } from "@/lib/utils";

/**
 * <ZhCaption> — 行内中英复合小字
 *
 * Used for: card meta lines, button helper text, KPI labels,
 * section descriptions. Smaller than ZhTitle and can be used
 * in tight layouts (icon row, badge, etc.).
 */
export interface ZhCaptionProps {
  /** Chinese primary text (Inter, normal weight). */
  zh: string;
  /** Optional English secondary (JetBrains Mono, uppercase). */
  en?: string;
  /** Whether to render the English caption above the Chinese. */
  enFirst?: boolean;
  className?: string;
  as?: "span" | "div" | "p";
}

export function ZhCaption({
  zh,
  en,
  enFirst = true,
  className,
  as: Tag = "div",
}: ZhCaptionProps) {
  const englishPart = en && (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
      {en}
    </span>
  );
  const chinesePart = <span className="text-sm text-foreground">{zh}</span>;

  return (
    <Tag
      className={cn(
        "flex items-center gap-2",
        enFirst ? "flex-row" : "flex-row-reverse",
        className
      )}
    >
      {englishPart}
      {chinesePart}
    </Tag>
  );
}
