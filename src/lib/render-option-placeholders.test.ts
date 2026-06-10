import { describe, it, expect } from "vitest";
import { renderOptionPlaceholders } from "./render-option-placeholders";

/**
 * Contract: `{{#N}}` resolves to whatever label the caller has
 * assigned to the source-N option. The helper itself doesn't
 * care whether labels are letters (A/B/C/D), numbers (1/2/3),
 * or anything else — it just dispatches `{{#N}}` → caller
 * resolver, which returns the label string for sourceIndex N-1.
 *
 * The caller in card-body.tsx builds the resolver from the
 * current permutation (source-1's current display position →
 * LETTER[displayPos]). These tests pin both the helper's
 * pass-through behavior and a representative LETTER-style
 * resolver so the integration stays locked.
 */

const LETTER = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

/**
 * Build a resolver from a source-index → display-position map
 * (the `displayPosByOriginal` map in card-body.tsx). Mimics
 * the real integration shape: lookup the display position,
 * then return LETTER[displayPos] (or fall back to a 1-based
 * digit if displayPos >= LETTER.length).
 */
function resolverFromMap(map: Map<number, number>) {
  return (sourceIndex: number): string | undefined => {
    const displayPos = map.get(sourceIndex);
    if (displayPos === undefined) return undefined;
    return LETTER[displayPos] ?? String(displayPos + 1);
  };
}

describe("renderOptionPlaceholders", () => {
  it("replaces {{#N}} with the source-N's current label", () => {
    // Source order: A, B, C. No shuffle — each source is at
    // its own display position.
    const map = new Map([
      [0, 0], // source-1 (A) at display 0
      [1, 1], // source-2 (B) at display 1
      [2, 2], // source-3 (C) at display 2
    ]);
    const out = renderOptionPlaceholders("Bigger than {{#1}}?", resolverFromMap(map));
    expect(out).toBe("Bigger than A?");
  });

  it("supports multiple placeholders in one string", () => {
    const map = new Map([
      [0, 0],
      [1, 1],
    ]);
    const out = renderOptionPlaceholders("{{#1}} or {{#2}}?", resolverFromMap(map));
    expect(out).toBe("A or B?");
  });

  it("tracks the source index AFTER shuffle", () => {
    // Critical contract: source-1 is the FIRST option the author
    // created, not "the option currently at display 1". After a
    // shuffle, source-1 may be at display position 3.
    // Map says: source-0 (A) is at display 1, source-1 (B) is
    // at display 0, source-2 (C) is at display 2.
    const map = new Map([
      [0, 1], // source-1 (A) at display 1
      [1, 0], // source-2 (B) at display 0
      [2, 2], // source-3 (C) at display 2
    ]);
    // {{#1}} = source-1 (A) → displayPos 1 → LETTER[1] = "B".
    const front = renderOptionPlaceholders("Bigger than {{#1}}?", resolverFromMap(map));
    expect(front).toBe("Bigger than B?");
  });

  it("leaves the placeholder intact when the source index is out of range", () => {
    const map = new Map([
      [0, 0],
      [1, 1],
    ]);
    // source-9 doesn't exist; resolver returns undefined; helper
    // leaves the literal placeholder.
    const out = renderOptionPlaceholders("Compare {{#9}} to {{#1}}.", resolverFromMap(map));
    expect(out).toBe("Compare {{#9}} to A.");
  });

  it("ignores non-placeholder braces", () => {
    const map = new Map([[0, 0]]);
    const out = renderOptionPlaceholders(
      "{not a placeholder} {{also-not}} {{#1}}",
      resolverFromMap(map)
    );
    expect(out).toBe("{not a placeholder} {{also-not}} A");
  });

  it("returns the input unchanged when there are no placeholders", () => {
    const map = new Map<number, number>();
    const input = "plain text";
    expect(renderOptionPlaceholders(input, resolverFromMap(map))).toBe(input);
  });

  it("leaves the placeholder intact when the source map is empty", () => {
    // No options exist; every {{#N}} is out of range.
    const map = new Map<number, number>();
    const out = renderOptionPlaceholders("{{#1}}", resolverFromMap(map));
    expect(out).toBe("{{#1}}");
  });

  it("works inside option text — option C referencing source-1", () => {
    // Author wrote option C: "C: contains {{#1}}". After a
    // shuffle, source-1 (A) lands at display 0. The option
    // text's `{{#1}}` must still resolve to A's label, not C's.
    const map = new Map([
      [0, 0], // source-1 (A) at display 0
      [1, 2], // source-2 (B) at display 2
      [2, 1], // source-3 (C) at display 1
    ]);
    const optionCSourceText = "C: contains {{#1}}";
    const out = renderOptionPlaceholders(optionCSourceText, resolverFromMap(map));
    expect(out).toBe("C: contains A");
  });

  it("falls back to a 1-based digit when displayPos exceeds the LETTER array", () => {
    // 10 options; only A-H have letter labels, the rest use digits.
    const map = new Map([[9, 7]]); // source-10 at display 7
    const out = renderOptionPlaceholders("{{#10}}", resolverFromMap(map));
    expect(out).toBe("H");
    const out2 = renderOptionPlaceholders("{{#9}}", resolverFromMap(new Map([[8, 9]])));
    expect(out2).toBe("10");
  });
});
