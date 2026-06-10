import { Pause, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CardPreview } from "@/components/gallery/card-preview";
import { CardTypeBadge } from "./card-type-badge";
import { stripMarkdown } from "@/lib/strip-markdown";
import type { CardType } from "@/lib/validation";
import { cn } from "@/lib/utils";

export interface CardGalleryTileCard {
  id: string;
  type: string;
  frontContent: string | null;
  backContent: string | null;
  isFavorite: boolean;
  suspended: boolean;
  updatedAt: Date | string;
}

interface CardGalleryTileProps {
  card: CardGalleryTileCard;
  /**
   * Called when the user activates the tile. The parent owns the
   * modal open state — keeping the tile as a stateless presentational
   * component so it can stay a server component (the kebab menu
   * opens an inline dropdown, NOT the modal).
   */
  onOpen: (cardId: string) => void;
}

/**
 * Single tile for the in-deck card gallery.
 *
 * Renders a compact card (4px type-accent top border, no large
 * cover / no gradient fill) showing the question title + a 3-line
 * preview of the question body. The tile is a `<button>` that
 * opens the CardDetailModal (DECK-03 — same page, no navigation).
 *
 * Server component. No `"use client"`. The Card / CardTypeBadge
 * children are themselves client components where needed.
 */
export function CardGalleryTile({ card, onOpen }: CardGalleryTileProps) {
  const strippedFront = stripMarkdown(card.frontContent ?? "").slice(0, 40);
  const accent = `var(--type-accent-${card.type})`;

  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      aria-label={`查看卡片「${strippedFront || "（无内容）"}」`}
      className="group block h-full w-full text-left"
    >
      <Card
        className={cn(
          "relative flex h-full flex-col overflow-hidden p-0",
          "transition-all hover:-translate-y-0.5 hover:shadow-md"
        )}
        style={{
          // 4px top accent strip in the card's type color.
          borderTop: `4px solid ${accent}`,
        }}
      >
        <div className="flex flex-1 flex-col gap-s p-m">
          <div className="flex items-center justify-between gap-s">
            <CardTypeBadge type={card.type as CardType} />
            <div className="flex items-center gap-1">
              {card.isFavorite ? (
                <Star
                  className="h-3.5 w-3.5 fill-current text-brand"
                  aria-label="已收藏"
                />
              ) : null}
              {card.suspended ? (
                <Pause
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-label="已暂停"
                />
              ) : null}
            </div>
          </div>
          <CardPreview
            content={card.frontContent}
            maxChars={80}
            className="flex-1 font-medium"
          />
        </div>
      </Card>
    </button>
  );
}

export default CardGalleryTile;
