import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "./markdown-renderer";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: "<svg>mock</svg>" })),
  },
}));

describe("MarkdownRenderer", () => {
  it("RENDER-01: renders GFM strikethrough", () => {
    render(<MarkdownRenderer content="~~strike~~" />);
    const el = screen.getByText("strike");
    expect(el.tagName).toBe("DEL");
  });

  it("RENDER-02: renders KaTeX inline math", () => {
    const { container } = render(<MarkdownRenderer content={"$x^2$"} />);
    expect(container.querySelector(".katex")).toBeTruthy();
  });

  it("RENDER-03: renders highlight.js on a code block", () => {
    const { container } = render(
      <MarkdownRenderer content={"```js\nconst x = 1\n```"} />
    );
    expect(container.querySelector("code.hljs")).toBeTruthy();
  });

  it("RENDER-04: renders a Mermaid block via MermaidBlock", async () => {
    const { findByTestId } = render(
      <MarkdownRenderer content={"```mermaid\ngraph TB\na-->b\n```"} />
    );
    const block = await findByTestId("mermaid-block");
    expect(block).toBeTruthy();
  });
});
