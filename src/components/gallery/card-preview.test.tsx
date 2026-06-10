import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CardPreview } from "./card-preview";

describe("CardPreview", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders the stripped content as a line-clamped paragraph", () => {
    const { container } = render(<CardPreview content="# Hello **world**" />);
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe("Hello world");
    expect(p?.className).toContain("line-clamp-3");
  });

  it("truncates to maxChars with a trailing ellipsis", () => {
    const long = "a".repeat(100);
    render(<CardPreview content={long} maxChars={30} />);
    // 30 chars + … (U+2026)
    const expected = "a".repeat(30) + "…";
    expect(screen.getByText(expected)).toBeDefined();
  });

  it("renders the empty-content fallback for null input", () => {
    render(<CardPreview content={null} />);
    expect(screen.getByText("（无内容）")).toBeDefined();
  });
});
