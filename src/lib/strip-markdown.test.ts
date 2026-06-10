import { describe, it, expect } from "vitest";
import { stripMarkdown } from "./strip-markdown";

describe("stripMarkdown", () => {
  it("strips headings, emphasis, and inline code", () => {
    expect(stripMarkdown("# Hello **world** `code`")).toBe("Hello world code");
  });

  it("strips image / link syntax control characters", () => {
    // The function deliberately only strips the markdown control
    // characters ([, ], (, ), !) - not the URL payload. This matches
    // the byte-for-byte contract with the legacy inlined version in
    // card-list.tsx / favorites-list.client.tsx.
    expect(stripMarkdown("![diagram](https://example.com/d.png) end")).toBe(
      "diagramhttps://example.com/d.png end"
    );
  });

  it("collapses whitespace and trims", () => {
    expect(stripMarkdown("  line1\n\nline2  \t")).toBe("line1 line2");
  });
});
