import { describe, it, expect } from "vitest";
import {
  extractPlaceholders,
  parseFromJson,
  parseFromMarkdown,
  serializeToJson,
  serializeToMarkdown,
  validatePlaceholders,
} from "./templates";
import type { NoteTypeJson } from "./validation";

describe("extractPlaceholders", () => {
  it("returns names in order for basic usage", () => {
    expect(extractPlaceholders("{{Front}} and {{Back}}")).toEqual([
      "Front",
      "Back",
    ]);
  });

  it("handles whitespace inside braces", () => {
    expect(extractPlaceholders("{{ Front }}{{Back}}")).toEqual([
      "Front",
      "Back",
    ]);
  });

  it("accepts names with digits and underscores", () => {
    expect(extractPlaceholders("{{X1}} {{_Y_2}}")).toEqual(["X1", "_Y_2"]);
  });

  it("returns empty array for no placeholders", () => {
    expect(extractPlaceholders("hello world")).toEqual([]);
  });

  it("ignores empty braces {{}}", () => {
    expect(extractPlaceholders("{{}}")).toEqual([]);
  });
});

describe("validatePlaceholders", () => {
  it("returns null when all placeholders are defined", () => {
    expect(
      validatePlaceholders("{{Front}} {{Back}}", new Set(["Front", "Back"]))
    ).toBeNull();
  });

  it("returns the first undefined name", () => {
    expect(
      validatePlaceholders("{{Front}} {{Bad}} {{Worse}}", new Set(["Front"]))
    ).toBe("Bad");
  });

  it("returns null for empty string", () => {
    expect(validatePlaceholders("", new Set())).toBeNull();
  });

  it("returns null for text with no placeholders", () => {
    expect(validatePlaceholders("just text", new Set(["X"]))).toBeNull();
  });

  it("treats Anki specials (FrontSide, Tags, ...) as valid", () => {
    expect(
      validatePlaceholders(
        "{{FrontSide}} {{Tags}}",
        new Set(["Front"])
      )
    ).toBeNull();
  });
});

const fixtures: NoteTypeJson[] = [
  {
    name: "Basic",
    fields: [
      { name: "Front", ord: 0 },
      { name: "Back", ord: 1 },
    ],
    templates: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Front}}",
        afmt: "{{FrontSide}}<hr>{{Back}}",
      },
    ],
  },
  {
    name: "Multi",
    fields: [
      { name: "A", ord: 0 },
      { name: "B", ord: 1 },
      { name: "C", ord: 2 },
    ],
    templates: [
      {
        name: "T1",
        ord: 0,
        qfmt: "{{A}} - {{B}} - {{C}}",
        afmt: "{{FrontSide}} | {{A}} | {{B}} | {{C}}",
      },
      {
        name: "T2",
        ord: 1,
        qfmt: "Q: {{A}}",
        afmt: "A: {{A}}<br>B: {{B}}",
      },
    ],
  },
  {
    name: "LongQfmt",
    fields: [{ name: "X", ord: 0 }],
    templates: [
      {
        name: "Long",
        ord: 0,
        qfmt: "x".repeat(250) + " {{X}}",
        afmt: "{{FrontSide}}",
      },
    ],
  },
  {
    name: "Special",
    fields: [{ name: "Q", ord: 0 }],
    templates: [
      {
        name: "S",
        ord: 0,
        qfmt: 'Q: {{Q}} & <tag> "quoted" \'apos\' \n newline',
        afmt: "A: {{Q}}",
      },
    ],
  },
];

describe("JSON round-trip (D-02 lossless)", () => {
  for (const fixture of fixtures) {
    it(`round-trips ${fixture.name}`, () => {
      expect(parseFromJson(serializeToJson(fixture))).toEqual(fixture);
    });
  }
});

describe("Markdown round-trip (D-02 lossless)", () => {
  for (const fixture of fixtures) {
    it(`round-trips ${fixture.name}`, () => {
      expect(parseFromMarkdown(serializeToMarkdown(fixture))).toEqual(
        fixture
      );
    });
  }
});

describe("Markdown parsing edge cases", () => {
  it("ignores body content after the front-matter", () => {
    const fixture = fixtures[0]!;
    const md =
      serializeToMarkdown(fixture) +
      "\n# Body content that should be ignored\nMore body.";
    expect(parseFromMarkdown(md)).toEqual(fixture);
  });

  it("throws on missing front-matter", () => {
    expect(() => parseFromMarkdown("no front matter here")).toThrow(
      /YAML front-matter/
    );
  });

  it("throws on invalid JSON-like text", () => {
    expect(() => parseFromJson("{invalid}")).toThrow();
  });

  it("throws on NoteType that violates schema (empty fields)", () => {
    expect(() =>
      parseFromJson(
        '{"name":"X","fields":[],"templates":[{"name":"T","ord":0,"qfmt":"","afmt":""}]}'
      )
    ).toThrow(/至少 1 个字段/);
  });
});
