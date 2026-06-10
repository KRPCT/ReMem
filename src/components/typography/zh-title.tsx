import { cn } from "@/lib/utils";

/**
 * <ZhTitle> — 单一 voice 的页面标题
 *
 * Chinese H1 in LXGW WenKai (loaded via next/font, see
 * `src/app/layout.tsx`) + a small English caption in JetBrains
 * Mono, sitting above the H1.
 *
 * The H1 binds to `--font-family-display` via the `.font-display`
 * utility class (defined in `src/app/globals.css`). Page authors
 * don't need to know about the font-family plumbing.
 */
type Size = "display" | "h1" | "h2" | "h3" | "h4";

const sizeMap: Record<Size, string> = {
  // Fluid clamp-based sizes for hero / page-level
  display: "text-fluid-display",
  h1: "text-fluid-h1",
  h2: "text-fluid-h2",
  // Static sizes for section / inline titles
  h3: "text-2xl font-semibold leading-snug tracking-tight md:text-3xl",
  h4: "text-lg font-semibold leading-snug tracking-tight md:text-xl",
};

export interface ZhTitleProps {
  /** Main Chinese title (mandatory). LXGW WenKai + Songti fallback. */
  zh: string;
  /** Optional small English caption (JetBrains Mono, uppercase). */
  en?: string;
  /** Size scale — defaults to "h1" which suits most page-level titles. */
  size?: Size;
  /** Horizontal alignment of the title + caption block. */
  align?: "left" | "center" | "right";
  /** Extra classes to pass to the wrapping <header> element. */
  className?: string;
  /** Override the rendered heading tag (defaults to <h1>). */
  as?: "h1" | "h2" | "h3";
}

export function ZhTitle({
  zh,
  en,
  size = "h1",
  align = "left",
  className,
  as: Heading = "h1",
}: ZhTitleProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-1.5",
        align === "center" && "items-center text-center",
        align === "right" && "items-end text-right",
        className
      )}
    >
      {en && (
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {en}
        </span>
      )}
      <Heading
        className={cn(
          "font-display text-balance break-words",
          sizeMap[size]
        )}
      >
        {zh}
      </Heading>
    </header>
  );
}
