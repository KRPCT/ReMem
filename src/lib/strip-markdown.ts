/**
 * Strip Markdown syntax to plain text for thumbnail / list previews.
 *
 * Mirrors the regex chain inlined in `card-list.tsx` (legacy) and
 * `favorites-list.client.tsx` (legacy) — extracted here so all 3
 * call sites (legacy row list + new card gallery + favorites list)
 * stay byte-for-byte identical in behavior.
 *
 * IMPORTANT: do NOT change the regex without re-running
 * `pnpm test src/lib/strip-markdown.test.ts`. The exact character
 * class is part of the public contract; downstream list views
 * rely on stripping `**bold**`, `# heading`, `code`, `[]()`, `!`,
 * `>` without affecting CJK / Latin word boundaries.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/[#*_`~\[\]()!>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
