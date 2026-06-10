import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCardFilter, type CardFilterInput } from "./use-card-filter";

type TestCard = CardFilterInput & { extra: string };

const baseCards: TestCard[] = [
  {
    id: "1",
    type: "qa",
    isFavorite: true,
    frontContent: "What is **FSRS**?",
    backContent: "A spaced repetition algorithm",
    extra: "x",
  },
  {
    id: "2",
    type: "choice",
    isFavorite: false,
    frontContent: "Pick the right answer",
    backContent: "choice explanation",
    extra: "x",
  },
  {
    id: "3",
    type: "judge",
    isFavorite: true,
    frontContent: "True or false?",
    backContent: "true",
    extra: "x",
  },
  {
    id: "4",
    type: "fill",
    isFavorite: false,
    frontContent: "Fill in the blank",
    backContent: "answer",
    extra: "x",
  },
];

describe("useCardFilter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces the search input by 200ms", () => {
    const { result } = renderHook(() => useCardFilter(baseCards));
    expect(result.current.debouncedSearch).toBe("");

    act(() => {
      result.current.setSearch("fsrs");
    });
    // Before 200ms the debounced value is still empty.
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current.debouncedSearch).toBe("");

    // After 200ms the value flushes.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.debouncedSearch).toBe("fsrs");
  });

  it("lowercases and trims the search query when filtering", async () => {
    const { result } = renderHook(() => useCardFilter(baseCards));
    act(() => {
      result.current.setSearch("  FsRs ");
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    // The "FSRS" question matches via lowercased "fsrs" against
    // the stripped front content ("What is FSRS?" -> "What is FSRS").
    expect(result.current.visible.length).toBe(1);
    expect(result.current.visible[0].id).toBe("1");
  });

  it("toggles type filters immutably", () => {
    const { result } = renderHook(() => useCardFilter(baseCards));
    act(() => {
      result.current.toggleTypeFilter("qa");
    });
    expect(result.current.typeFilters.has("qa")).toBe(true);
    // Only the qa card passes the type filter.
    expect(result.current.visible.length).toBe(1);
    expect(result.current.visible[0].type).toBe("qa");

    // Toggling again removes the type filter.
    act(() => {
      result.current.toggleTypeFilter("qa");
    });
    expect(result.current.typeFilters.size).toBe(0);
    expect(result.current.visible.length).toBe(baseCards.length);
  });

  it("filters to favorites only when favoritesOnly is true", () => {
    const { result } = renderHook(() => useCardFilter(baseCards));
    act(() => {
      result.current.setFavoritesOnly(true);
    });
    expect(result.current.visible.length).toBe(2);
    for (const c of result.current.visible) {
      expect(c.isFavorite).toBe(true);
    }
  });
});
