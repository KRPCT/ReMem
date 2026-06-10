import { cn } from "@/lib/utils";

interface DeckCoverProps {
  /**
   * The dominant accent color for this deck. Typically the
   * most-common card type's `--type-accent-{type}` value, or the
   * brand color for decks with mixed types. Pass the resolved CSS
   * `var(...)` string OR an HSL triplet — both work because we
   * just set it as `border-top-color` / `background-color`.
   */
  accent: string;
  className?: string;
}

/**
 * Slim deck accent strip.
 *
 * The Phase 5 redesign dropped the 5:2 cover thumbnail + display-font
 * initial in favor of a single, restrained accent line. The deck
 * tile is now mostly text (title, description, meta footer) with a
 * 4px top border + a small swatch in the corner indicating the
 * deck's dominant color.
 *
 * Server-safe. No `"use client"`. No hooks.
 */
export function DeckCover({ accent, className }: DeckCoverProps) {
  return (
    <div
      className={cn("flex items-center gap-s px-m pt-m", className)}
      aria-hidden
    >
      <span
        className="inline-block h-2 w-8 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <span
        className="inline-block h-1 flex-1 rounded-full opacity-30"
        style={{ backgroundColor: accent }}
      />
    </div>
  );
}

export default DeckCover;
