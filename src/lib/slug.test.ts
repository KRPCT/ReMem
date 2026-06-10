import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and dashes spaces", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("returns empty string for non-ASCII input", () => {
    expect(slugify("中文标题")).toBe("");
  });

  it("strips diacritics via NFKD", () => {
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });

  it("collapses non-alphanumeric runs into single dashes", () => {
    expect(slugify("  spaces  & symbols! ")).toBe("spaces-symbols");
  });

  it("clamps to 60 characters", () => {
    expect(slugify("a".repeat(100)).length).toBe(60);
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("---hello---")).toBe("hello");
  });
});
