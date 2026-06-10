/**
 * Pure-function library for NoteType JSON / Markdown serialization,
 * parsing, and `{{FieldName}}` placeholder syntax validation.
 *
 * No React, no DB, no fetch — unit-testable in isolation.
 */
import yaml from "js-yaml";
import { noteTypeJsonSchema, type NoteTypeJson } from "@/lib/validation";

/**
 * Regex matching `{{FieldName}}` placeholders. Flags: `g` (global — multiple
 * matches per input). The capture group is the field name; spaces around the
 * name are tolerated per the Anki convention.
 */
export const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Returns placeholder names in scan order. Does not deduplicate. */
export function extractPlaceholders(text: string): string[] {
  const out: string[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    out.push(m[1] as string);
  }
  return out;
}

/**
 * Anki special placeholders that are NOT user-defined fields. They are part
 * of the Anki templating language and are valid in `qfmt` / `afmt` without
 * being declared in `NoteType.fields`. Reference: Anki Manual → Templates →
 * "Special fields". v1 supports the read-only side; rendering-time
 * substitution for these is Phase 6/7.
 */
const ANKI_SPECIAL_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "FrontSide", // rendered front content of the current card
  "Tags", // card tags
  "Type", // note type name
  "Deck", // parent deck name
  "Subdeck", // subdeck name (without parent)
  "Card", // card template name
  "Flag", // card flag (Anki 2.1.18+)
]);

/**
 * Returns the FIRST placeholder name not in `allowed` and not an Anki
 * special placeholder, or `null` if all are valid. Phase 3 deliberately does
 * NOT do value substitution (deferred to Phase 6/7); this is a pure syntax
 * check.
 */
export function validatePlaceholders(
  text: string,
  allowed: ReadonlySet<string>
): string | null {
  for (const name of extractPlaceholders(text)) {
    if (ANKI_SPECIAL_PLACEHOLDERS.has(name)) continue;
    if (!allowed.has(name)) return name;
  }
  return null;
}

/** Lossless JSON serialization (D-02). */
export function serializeToJson(nt: NoteTypeJson): string {
  return JSON.stringify(nt, null, 2);
}

/**
 * Lossless YAML front-matter serialization (D-02).
 *
 * CRITICAL: `lineWidth: -1` disables js-yaml's line-folding for long
 * `qfmt` / `afmt` strings. Without it, a 200-char URL gets folded to two
 * lines and the export → re-import round-trip is no longer byte-exact.
 * `noRefs: true` and `sortKeys: false` keep the document stable.
 */
export function serializeToMarkdown(nt: NoteTypeJson): string {
  const fm = yaml.dump(nt, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
  return `---\n${fm}---\n`;
}

/** Parse + Zod-validate a JSON string. Throws ZodError on invalid shape. */
export function parseFromJson(text: string): NoteTypeJson {
  const obj: unknown = JSON.parse(text);
  return noteTypeJsonSchema.parse(obj);
}

/**
 * Parse + Zod-validate a Markdown + YAML front-matter string. The body
 * (after the closing `---`) is intentionally ignored per D-02.
 */
export function parseFromMarkdown(text: string): NoteTypeJson {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) {
    throw new Error("缺少 YAML front-matter（需以 --- 开头）");
  }
  const obj: unknown = yaml.load(m[1] ?? "");
  return noteTypeJsonSchema.parse(obj);
}
