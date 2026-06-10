import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * <Wordmark> — 品牌文字 + 中文小字副标
 *
 * Used in the top nav. Replaces the raw "ReMem" text in
 * site-header.tsx with a more intentional composition: the
 * wordmark itself, plus a tiny mono "记忆" caption on
 * `sm+` viewports to signal the Chinese-first direction.
 */
export interface WordmarkProps {
  href?: string;
  className?: string;
  /** Show the small "记忆" caption. Defaults to true. */
  showCaption?: boolean;
}

export function Wordmark({
  href = "/",
  className,
  showCaption = true,
}: WordmarkProps) {
  const content = (
    <span
      className={cn(
        "flex items-baseline gap-2 transition-opacity hover:opacity-80",
        className
      )}
    >
      <span className="text-lg font-bold tracking-tight md:text-xl">
        <span className="text-brand">Re</span>
        <span>Mem</span>
      </span>
      {showCaption && (
        <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
          记忆
        </span>
      )}
    </span>
  );

  return <Link href={href}>{content}</Link>;
}
