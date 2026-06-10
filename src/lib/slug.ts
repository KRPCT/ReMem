/**
 * Convert a deck title to a URL-safe slug used as the download filename
 * stem for the "下载原始模板" button. Returns "" on all-CJK / all-symbol
 * input; callers should fall back to `deck.id`.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
