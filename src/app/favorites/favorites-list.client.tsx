"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import type { CardType } from "@/lib/validation";
import { stripMarkdown } from "@/lib/strip-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CardTypeBadge } from "../decks/[id]/cards/card-type-badge";
import { toggleFavoriteAction } from "../decks/[id]/cards/actions";

export interface FavoritesListCard {
  id: string;
  deckId: string;
  deckTitle: string;
  type: string;
  frontContent: string | null;
  backContent: string | null;
  isFavorite: boolean;
  suspended: boolean;
}

interface FavoritesListProps {
  cards: FavoritesListCard[];
  /** If true, render the deck filter chips (default true). */
  showDeckFilter?: boolean;
}

const TYPE_FILTERS: CardType[] = [
  "qa",
  "choice",
  "multi_choice",
  "fill",
  "judge",
];

function FavoritesEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">还没有收藏的卡片。</p>
      <Button asChild className="mt-3">
        <Link href="/decks" prefetch>
          浏览牌组
        </Link>
      </Button>
    </div>
  );
}

function FavoritesNoMatches() {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">没有匹配的收藏。</p>
    </div>
  );
}

export function FavoritesList({
  cards,
  showDeckFilter = true,
}: FavoritesListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<CardType>>(new Set());
  const [deckFilters, setDeckFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(id);
  }, [search]);

  const typeCounts = useMemo(() => {
    const map: Record<CardType, number> = {
      qa: 0,
      choice: 0,
      multi_choice: 0,
      fill: 0,
      judge: 0,
    };
    for (const c of cards) {
      if (c.type in map) map[c.type as CardType]++;
    }
    return map;
  }, [cards]);

  const deckCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) {
      map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1);
    }
    return map;
  }, [cards]);

  const visible = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return cards.filter((c) => {
      if (deckFilters.size > 0 && !deckFilters.has(c.deckId)) return false;
      if (typeFilters.size > 0 && !typeFilters.has(c.type as CardType)) {
        return false;
      }
      if (q) {
        const front = stripMarkdown(c.frontContent ?? "").toLowerCase();
        const back = stripMarkdown(c.backContent ?? "").toLowerCase();
        if (!front.includes(q) && !back.includes(q)) return false;
      }
      return true;
    });
  }, [cards, debouncedSearch, typeFilters, deckFilters]);

  const toggleTypeFilter = (t: CardType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleDeckFilter = (deckId: string) => {
    setDeckFilters((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  };

  if (cards.length === 0) {
    return <FavoritesEmpty />;
  }

  return (
    <div className="space-y-m">
      <div className="flex flex-col gap-s sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="搜索题目或解析..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input flex-1"
          aria-label="搜索收藏"
        />
        <span
          className="inline-flex h-8 items-center gap-1 rounded-full border border-brand bg-brand-subtle px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-brand"
          aria-label="仅显示收藏"
        >
          <Star className="h-3 w-3 fill-current" aria-hidden />
          仅收藏
        </span>
      </div>

      <div className="flex flex-wrap gap-s">
        {TYPE_FILTERS.map((t) => {
          const active = typeFilters.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleTypeFilter(t)}
              aria-pressed={active}
              className={
                active
                  ? "h-8 rounded-full border border-brand bg-brand px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground transition-colors"
                  : "h-8 rounded-full border border-border bg-card/40 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors hover:border-brand"
              }
            >
              {t} ({typeCounts[t]})
            </button>
          );
        })}
        {typeFilters.size > 0 || deckFilters.size > 0 || debouncedSearch ? (
          <button
            type="button"
            onClick={() => {
              setTypeFilters(new Set());
              setDeckFilters(new Set());
              setSearch("");
              setDebouncedSearch("");
            }}
            className="h-8 rounded-full border border-transparent px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            清除筛选
          </button>
        ) : null}
      </div>

      {showDeckFilter && deckCounts.size > 1 ? (
        <div className="flex flex-wrap gap-s">
          {Array.from(deckCounts.entries()).map(([deckId, count]) => {
            const active = deckFilters.has(deckId);
            const deckTitle =
              cards.find((c) => c.deckId === deckId)?.deckTitle ?? deckId;
            return (
              <button
                key={deckId}
                type="button"
                onClick={() => toggleDeckFilter(deckId)}
                aria-pressed={active}
                className={
                  active
                    ? "h-8 rounded-full border border-brand bg-brand px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground transition-colors"
                    : "h-8 rounded-full border border-border bg-card/40 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors hover:border-brand"
                }
              >
                {deckTitle} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <FavoritesNoMatches />
      ) : (
        <div className="flex flex-col gap-s">
          {visible.map((card) => {
            const preview = stripMarkdown(card.frontContent ?? "").slice(0, 60);
            return (
              <Card
                key={card.id}
                className="flex min-h-12 items-center gap-m px-m py-s transition-colors hover:border-brand"
              >
                <Link
                  href={`/decks/${card.deckId}/cards/${card.id}`}
                  className="flex flex-1 items-center gap-m"
                >
                  <CardTypeBadge type={card.type as CardType} />
                  <span className="line-clamp-1 flex-1 text-sm">
                    {preview || "（无内容）"}
                  </span>
                  <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
                    {card.deckTitle}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      await toggleFavoriteAction(card.id, card.deckId);
                      router.refresh();
                    });
                  }}
                  disabled={pending}
                  aria-label="取消收藏"
                  aria-pressed={true}
                  className="rounded-xl p-1 transition-colors hover:bg-card/60"
                >
                  <Star
                    className="h-4 w-4 fill-current text-brand"
                    aria-hidden
                  />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
