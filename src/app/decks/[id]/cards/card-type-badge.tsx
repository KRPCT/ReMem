import { cn } from "@/lib/utils";
import type { CardType } from "@/lib/validation";

const TYPE_LABEL: Record<CardType, string> = {
  choice: "单选",
  multi_choice: "多选",
  fill: "填空",
  qa: "问答",
  judge: "判断",
};

export function CardTypeBadge({
  type,
  className,
}: {
  type: CardType;
  className?: string;
}) {
  // The accent color comes from a CSS variable so the user can
  // override per-type from /settings (see useTypeAccent).
  // Alpha-tinted background uses the same variable at 15% opacity.
  const accentVar = `var(--type-accent-${type})`;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]",
        className
      )}
      style={{
        color: accentVar,
        backgroundColor: `hsl(${accentVar} / 0.15)`,
      }}
      aria-label={`题型: ${TYPE_LABEL[type]}`}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}
