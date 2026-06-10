"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypeFilterPills } from "@/components/gallery/type-filter-pills";
import { useCardFilter } from "@/lib/use-card-filter";
import { CARD_TYPES } from "@/lib/validation";
import { CardGalleryTile } from "./card-gallery-tile";
import { CardDetailModal } from "./card-detail-modal";

export interface CardGalleryCard {
  id: string;
  type: string;
  frontContent: string | null;
  backContent: string | null;
  isFavorite: boolean;
  suspended: boolean;
  updatedAt: Date | string;
  /** Raw JSON from Prisma. Parsed client-side by the modal. */
  typeData: unknown;
}

interface CardGalleryProps {
  deckId: string;
  cards: CardGalleryCard[];
}

/**
 * Default view of the in-deck area: a 1/2/3/4/5 col grid of
 * `<CardGalleryTile>`s. Filter state (search / type / favorites) is
 * owned by `useCardFilter` so the row list (`?view=list`) and the
 * gallery stay in sync.
 *
 * Phase 5 redesign: clicking a tile opens `<CardDetailModal>` on
 * the SAME page (DECK-03 = "preview overlay"). No navigation; the
 * user can dismiss with Escape, the X button, the close button, or
 * a backdrop click. The `?view=` URL param is owned by the page
 * wrapper; this component only knows the filtered card list.
 */
export function CardGallery({ deckId, cards }: CardGalleryProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const {
    search,
    typeFilters,
    favoritesOnly,
    visible,
    counts,
    setSearch,
    toggleTypeFilter,
    setFavoritesOnly,
    clearAll,
  } = useCardFilter(cards);

  const openCard = (id: string) => setActiveCardId(id);
  const closeModal = () => setActiveCardId(null);

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">还没有卡片。</p>
        <Button asChild className="mt-3">
          <Link href={`/decks/${deckId}/cards/new`} prefetch>
            + 新建卡片
          </Link>
        </Button>
      </div>
    );
  }

  const hasActiveFilter =
    typeFilters.size > 0 || favoritesOnly || search.trim().length > 0;
  const activeCard = activeCardId
    ? cards.find((c) => c.id === activeCardId) ?? null
    : null;

  return (
    <div className="space-y-m">
      <div className="flex flex-col gap-s sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="搜索题目或解析..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input flex-1"
          aria-label="搜索卡片"
        />
        <Button
          type="button"
          variant={favoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          aria-pressed={favoritesOnly}
        >
          <Star
            className={favoritesOnly ? "h-4 w-4 fill-current" : "h-4 w-4"}
            aria-hidden
          />
          <span className="ml-1">仅收藏</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-s">
        <TypeFilterPills
          types={CARD_TYPES}
          active={typeFilters}
          counts={counts}
          onToggle={toggleTypeFilter}
        />
        {hasActiveFilter ? (
          <button
            type="button"
            onClick={() => {
              clearAll();
              startTransition(() => router.refresh());
            }}
            className="h-8 rounded-full border border-transparent px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            清除筛选
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">没有匹配的卡片。</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-m sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visible.map((c, index) => (
            <li key={c.id} className="animate-section-in" style={{ animationDelay: `${index * 80}ms` }}>
              <CardGalleryTile card={c} onOpen={openCard} />
            </li>
          ))}
        </ul>
      )}

      <CardDetailModal
        deckId={deckId}
        card={activeCard}
        onClose={closeModal}
      />
    </div>
  );
}

export default CardGallery;
