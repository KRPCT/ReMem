import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ThumbnailGradient } from "./thumbnail-gradient";

describe("ThumbnailGradient", () => {
  afterEach(() => {
    cleanup();
  });
  it("returns a stable hue for the same seed", () => {
    const { container, rerender } = render(<ThumbnailGradient seed="card-123" />);
    const firstHue = container.firstElementChild?.getAttribute("data-hue");
    rerender(<ThumbnailGradient seed="card-123" />);
    const secondHue = container.firstElementChild?.getAttribute("data-hue");
    expect(firstHue).toBe(secondHue);
    expect(firstHue).not.toBeNull();
  });

  it("hue stays in the [120, 219] range across multiple seeds", () => {
    const seeds = ["a", "b", "c", "d", "e", "longer-string-1", "卡片-1", "f"];
    for (const seed of seeds) {
      const { container } = render(<ThumbnailGradient seed={seed} />);
      const hue = Number(container.firstElementChild?.getAttribute("data-hue"));
      expect(hue).toBeGreaterThanOrEqual(120);
      expect(hue).toBeLessThanOrEqual(219);
    }
  });
});
