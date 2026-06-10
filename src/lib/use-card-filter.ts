"use client";

import { useEffect, useMemo, useState } from "react";
import { CARD_TYPES, type CardType } from "@/lib/validation";
import { stripMarkdown } from "@/lib/strip-markdown";

/**
 * Shared filter state machine for the in-deck card list and gallery.
 *
 * Lifted out of `card-list.tsx` (legacy row view) and reused by the
 * new `card-gallery.tsx` (Phase 5 default) so the debounce / type-set
 * / favorites-only state is no longer forked between the two views.
 *
 * Filter pipeline (in order):
 *   1. type filter set  - empty set = no type constraint
 *   2. favorites-only   - when true, hide non-favorite cards
 *   3. debounced search - lowercased; matches against stripped
 *                          frontContent OR backContent
 *
 * Returns the raw setters (setSearch / setFavoritesOnly) AND a
 * convenience `clearAll` for the "清除筛选" button. The toggle
 * helper for type filters is a fresh Set on every call so React
 * detects the state change (same pattern the legacy code used).
 */
export interface CardFilterInput {
  id: string;
  type: string;
  isFavorite: boolean;
  frontContent: string | null;
  backContent: string | null;
}

export interface CardFilterResult<T extends CardFilterInput> {
  search: string;
  debouncedSearch: string;
  typeFilters: Set<CardType>;
  favoritesOnly: boolean;
  visible: T[];
  counts: Record<CardType, number>;
  setSearch: (s: string) => void;
  toggleTypeFilter: (t: CardType) => void;
  setFavoritesOnly: (v: boolean) => void;
  clearAll: () => void;
}

const EMPTY_COUNTS: Record<CardType, number> = {
  qa: 0,
  choice: 0,
  multi_choice: 0,
  fill: 0,
  judge: 0,
};

export function useCardFilter<T extends CardFilterInput>(
  cards: T[]
): CardFilterResult<T> {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<CardType>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // 200ms debounce, matches the legacy `card-list.tsx` cadence.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(id);
  }, [search]);

  const counts = useMemo<Record<CardType, number>>(() => {
    const map: Record<CardType, number> = { ...EMPTY_COUNTS };
    for (const c of cards) {
      if ((CARD_TYPES as readonly string[]).includes(c.type)) {
        map[c.type as CardType]++;
      }
    }
    return map;
  }, [cards]);

  const visible = useMemo<T[]>(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return cards.filter((c) => {
      if (typeFilters.size > 0 && !typeFilters.has(c.type as CardType)) {
        return false;
      }
      if (favoritesOnly && !c.isFavorite) return false;
      if (q) {
        const front = stripMarkdown(c.frontContent ?? "").toLowerCase();
        const back = stripMarkdown(c.backContent ?? "").toLowerCase();
        if (!front.includes(q) && !back.includes(q)) return false;
      }
      return true;
    });
  }, [cards, debouncedSearch, typeFilters, favoritesOnly]);

  const toggleTypeFilter = (t: CardType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const clearAll = () => {
    setTypeFilters(new Set());
    setFavoritesOnly(false);
    setSearch("");
    setDebouncedSearch("");
  };

  return {
    search,
    debouncedSearch,
    typeFilters,
    favoritesOnly,
    visible,
    counts,
    setSearch,
    toggleTypeFilter,
    setFavoritesOnly,
    clearAll,
  };
}
