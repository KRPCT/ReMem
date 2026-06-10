import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { CardGalleryTile } from "./card-gallery-tile";
import type { CardGalleryTileCard } from "./card-gallery-tile";

const baseCard: CardGalleryTileCard = {
  id: "abc",
  type: "qa",
  frontContent: "What is **FSRS**?",
  backContent: "Spaced repetition.",
  isFavorite: true,
  suspended: false,
  updatedAt: new Date("2026-06-01T12:00:00Z"),
};

describe("CardGalleryTile", () => {
  afterEach(() => {
    cleanup();
  });

  it("calls onOpen with the card id when activated", () => {
    const onOpen = vi.fn();
    render(<CardGalleryTile card={baseCard} onOpen={onOpen} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("abc");
  });

  it("renders the type badge, favorite star, and suspend eye", () => {
    render(<CardGalleryTile card={baseCard} onOpen={() => {}} />);
    // Type badge - qa -> "问答"
    expect(screen.getByLabelText("题型: 问答")).toBeDefined();
    // Favorite star with aria-label "已收藏"
    expect(screen.getByLabelText("已收藏")).toBeDefined();
    // Suspended is false on baseCard, so no eye-off icon
    expect(screen.queryByLabelText("已暂停")).toBeNull();

    // Re-render with suspended=true and verify the eye-off shows
    cleanup();
    render(
      <CardGalleryTile
        card={{ ...baseCard, suspended: true }}
        onOpen={() => {}}
      />
    );
    expect(screen.getByLabelText("已暂停")).toBeDefined();
  });

  it("uses a 4px top border in the card's type-accent color", () => {
    const { container } = render(
      <CardGalleryTile card={baseCard} onOpen={() => {}} />
    );
    // The Card element should carry an inline borderTop using the
    // type-accent-qa variable.
    const card = container.querySelector(".glass-card");
    expect(card).not.toBeNull();
    const style = (card as HTMLElement).style.borderTop;
    expect(style).toContain("var(--type-accent-qa)");
    expect(style).toMatch(/4px/);
  });
});
