import { stripMarkdown } from "@/lib/strip-markdown";
import { cn } from "@/lib/utils";

interface CardPreviewProps {
  /**
   * Markdown source from the card's `frontContent` (or `backContent`).
   * `null` / empty string renders the "（无内容）" fallback.
   */
  content: string | null;
  /**
   * Maximum characters of the stripped preview (default 60). Anything
   * longer is truncated with a single trailing `…` (U+2026).
   *
   * Note: this is a CHARACTER cap, not a visual cap. The visual cap
   * comes from `line-clamp-3` on the wrapping `<p>`.
   */
  maxChars?: number;
  className?: string;
}

/**
 * Plain-text snippet for card tile thumbnails.
 *
 * **DO NOT** render full Markdown (Mermaid / KaTeX / CodeMirror
 * highlighting) inside this component. A deck with 100 cards
 * would trigger 100 Markdown renders on the gallery page — see
 * `05-RESEARCH.md` §7.10 for the perf contract.
 *
 * Server-safe. No `"use client"`. No hooks. No children.
 */
export function CardPreview({
  content,
  maxChars = 60,
  className,
}: CardPreviewProps) {
  if (content == null || content === "") {
    return (
      <p className={cn("line-clamp-3 text-sm text-muted-foreground", className)}>
        （无内容）
      </p>
    );
  }

  const stripped = stripMarkdown(content);
  const text = stripped.length > maxChars ? `${stripped.slice(0, maxChars)}…` : stripped;

  return (
    <p className={cn("line-clamp-3 text-sm", className)}>{text}</p>
  );
}

export default CardPreview;
