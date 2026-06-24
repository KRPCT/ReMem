"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Star,
  Trash2,
} from "lucide-react";
import type { CardType } from "@/lib/validation";
import { stripMarkdown } from "@/lib/strip-markdown";
import { useCardFilter } from "@/lib/use-card-filter";
import { CARD_TYPES } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypeFilterPills } from "@/components/gallery/type-filter-pills";
import { CardTypeBadge } from "./card-type-badge";
import { CardRowMenu } from "./card-row-menu";
import { CardDetailModal } from "./card-detail-modal";
import {
  batchDeleteCardsAction,
  batchToggleFavoriteAction,
  batchToggleSuspendAction,
  toggleFavoriteAction,
} from "./actions";

interface CardListCard {
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

interface CardListProps {
  deckId: string;
  cards: CardListCard[];
  /** B2: open the preview modal answer-revealed (browseDefaultShowAnswer). */
  defaultShowAnswer?: boolean;
}

function CardListEmpty({ deckId }: { deckId: string }) {
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

function CardListNoMatches() {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">没有匹配的卡片。</p>
    </div>
  );
}

export function CardList({
  deckId,
  cards,
  defaultShowAnswer = false,
}: CardListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const openCard = (id: string) => setActiveCardId(id);
  const closeModal = () => setActiveCardId(null);

  // Shared filter state machine (debounce + type + favorites). The
  // gallery uses the same hook so the two views stay in sync.
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

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((c) => c.id)));
    }
  };

  const runBatch = (action: (ids: string[]) => Promise<void>) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      await action(ids);
      setSelected(new Set());
      router.refresh();
    });
  };

  if (cards.length === 0) {
    return <CardListEmpty deckId={deckId} />;
  }

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

      <div className="flex flex-wrap gap-s">
        <TypeFilterPills
          types={CARD_TYPES}
          active={typeFilters}
          counts={counts}
          onToggle={toggleTypeFilter}
        />
        {typeFilters.size > 0 || favoritesOnly || search ? (
          <button
            type="button"
            onClick={() => clearAll()}
            className="h-8 rounded-full border border-transparent px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            清除筛选
          </button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div
          className="flex flex-wrap items-center gap-s rounded-xl border border-border bg-card/60 p-s"
          style={{
            animation: "slide-down var(--duration-normal) var(--curve-easy-out)",
          }}
        >
          <span className="text-sm text-muted-foreground">
            已选 {selected.size} 项
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              runBatch((ids) => batchToggleFavoriteAction(ids, deckId, true))
            }
          >
            <Star className="h-4 w-4" aria-hidden /> 收藏
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              runBatch((ids) => batchToggleFavoriteAction(ids, deckId, false))
            }
          >
            <Star className="h-4 w-4" aria-hidden /> 取消收藏
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              runBatch((ids) => batchToggleSuspendAction(ids, deckId, true))
            }
          >
            <Eye className="h-4 w-4" aria-hidden /> 暂停
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              runBatch((ids) => batchToggleSuspendAction(ids, deckId, false))
            }
          >
            <EyeOff className="h-4 w-4" aria-hidden /> 取消暂停
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (confirm(`确认删除 ${selected.size} 张卡片？`)) {
                runBatch((ids) => batchDeleteCardsAction(ids, deckId));
              }
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> 删除
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setSelected(new Set())}
            className="ml-auto"
          >
            清除选择
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <CardListNoMatches />
      ) : (
        <div className="flex flex-col gap-s">
          <div className="hidden items-center gap-s px-s text-xs text-muted-foreground sm:flex">
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === visible.length}
                onChange={toggleAllVisible}
                className="h-4 w-4"
                aria-label="全选当前筛选结果"
              />
              全选 ({visible.length})
            </label>
          </div>
          {visible.map((card) => {
            const preview = stripMarkdown(card.frontContent ?? "").slice(0, 60);
            const isSelected = selected.has(card.id);
            return (
              <Card
                key={card.id}
                className={`flex min-h-12 items-center gap-m px-m py-s transition-colors hover:border-brand ${
                  isSelected ? "border-brand" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(card.id)}
                  className="hidden h-4 w-4 shrink-0 sm:inline-flex"
                  aria-label={`选择卡片「${preview}」`}
                />
                <button
                  type="button"
                  onClick={() => openCard(card.id)}
                  className="flex flex-1 items-center gap-m text-left"
                >
                  <CardTypeBadge type={card.type as CardType} />
                  <span className="line-clamp-1 flex-1 text-sm">
                    {preview || "（无内容）"}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startTransition(async () => {
                        await toggleFavoriteAction(card.id, deckId);
                        router.refresh();
                      });
                    }}
                    disabled={pending}
                    aria-label={card.isFavorite ? "取消收藏" : "收藏"}
                    aria-pressed={card.isFavorite}
                    className="rounded-xl p-1 transition-colors hover:bg-card/60"
                  >
                    <Star
                      className={
                        card.isFavorite
                          ? "h-4 w-4 fill-current text-brand"
                          : "h-4 w-4 text-muted-foreground"
                      }
                      aria-hidden
                    />
                  </button>
                  {card.suspended ? (
                    <Eye
                      className="h-4 w-4 text-muted-foreground"
                      aria-label="已暂停"
                    />
                  ) : null}
                  <CardRowMenu
                    cardId={card.id}
                    deckId={deckId}
                    isFavorite={card.isFavorite}
                    suspended={card.suspended}
                    frontPreview={preview}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/*
        key on the active card id forces a fresh mount per card so the
        modal's internal `showAnswer` re-seeds from `defaultShowAnswer`
        each open (the modal is otherwise always mounted and would
        persist the previous card's reveal state).
      */}
      <CardDetailModal
        key={activeCardId ?? "closed"}
        deckId={deckId}
        card={activeCard}
        onClose={closeModal}
        defaultShowAnswer={defaultShowAnswer}
      />
    </div>
  );
}
