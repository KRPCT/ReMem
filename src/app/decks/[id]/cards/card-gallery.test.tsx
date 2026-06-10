import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { CardGallery } from "./card-gallery";
import type { CardGalleryCard } from "./card-gallery";

// next/navigation is consumed by CardGallery for the "clear all"
// path. Provide a no-op router so the test doesn't pull in the
// full Next router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

const baseCards: CardGalleryCard[] = [
  {
    id: "1",
    type: "qa",
    frontContent: "What is FSRS?",
    backContent: "Spaced repetition algorithm.",
    isFavorite: true,
    suspended: false,
    updatedAt: new Date("2026-06-01"),
    typeData: { type: "qa" },
  },
  {
    id: "2",
    type: "choice",
    frontContent: "Pick the answer",
    backContent: "explanation",
    isFavorite: false,
    suspended: false,
    updatedAt: new Date("2026-06-02"),
    typeData: {
      type: "choice",
      options: ["A", "B", "C"],
      answer: 1,
      shuffle: true,
      pinLastOption: false,
    },
  },
  {
    id: "3",
    type: "judge",
    frontContent: "True or false?",
    backContent: "true",
    isFavorite: true,
    suspended: false,
    updatedAt: new Date("2026-06-03"),
    typeData: { type: "judge", correct: true },
  },
  {
    id: "4",
    type: "fill",
    frontContent: "Fill in blank",
    backContent: "answer",
    isFavorite: false,
    suspended: false,
    updatedAt: new Date("2026-06-04"),
    typeData: { type: "fill", answers: ["answer"] },
  },
];

function countTiles() {
  // The new tile is a single <button aria-label="查看卡片「...」">.
  return screen.getAllByRole("button", { name: /查看卡片/ }).length;
}

describe("CardGallery", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the empty state when the deck has no cards", () => {
    render(<CardGallery deckId="d1" cards={[]} />);
    expect(screen.getByText("还没有卡片。")).toBeDefined();
  });

  it("renders one tile per card", () => {
    render(<CardGallery deckId="d1" cards={baseCards} />);
    expect(countTiles()).toBe(4);
  });

  it("filters the visible cards by type when a pill is toggled", async () => {
    vi.useFakeTimers();
    render(<CardGallery deckId="d1" cards={baseCards} />);
    // The qa pill shows "qa (1)" (only the FSRS card).
    const qaPill = screen.getByText("qa (1)");
    await act(async () => {
      fireEvent.click(qaPill);
    });
    expect(countTiles()).toBe(1);
  });

  it("filters the visible cards to favorites only when the favorites toggle is on", async () => {
    render(<CardGallery deckId="d1" cards={baseCards} />);
    const favBtn = screen.getByRole("button", { name: "仅收藏" });
    await act(async () => {
      fireEvent.click(favBtn);
    });
    expect(countTiles()).toBe(2);
  });

  it("shows the no-match empty state when filters exclude all cards", async () => {
    vi.useFakeTimers();
    render(<CardGallery deckId="d1" cards={baseCards} />);
    const search = screen.getByRole("searchbox", { name: "搜索卡片" });
    await act(async () => {
      fireEvent.change(search, { target: { value: "no-such-text-anywhere" } });
    });
    // Advance the 200ms debounce so the visible list re-derives.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("没有匹配的卡片。")).toBeDefined();
  });
});
