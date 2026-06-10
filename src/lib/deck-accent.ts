/**
 * Per-deck theme color, derived from a hash of the deck id.
 *
 * Each deck gets a stable muted accent from a curated 8-color
 * palette. Same deck id always returns the same color; different
 * decks fall on different palette entries. The hash is a
 * multiplicative prime walk over the string (cheap, deterministic,
 * no external deps).
 *
 * HSL triplets match the project's `--type-accent-{type}` shape so
 * consumers can compose the same way (e.g. `hsl(${accent} / 0.15)`).
 *
 * Palette: muted, low-saturation colors that read as "themes"
 * without competing with the brand sage at 162°. All values are
 * calibrated for the dark default background; light mode may need
 * deeper variants (currently the tile is glass-card-translucent so
 * the accent reads on both themes without per-theme overrides).
 */

const PALETTE: ReadonlyArray<{ hsl: string; label: string }> = [
  { hsl: "162 50% 58%", label: "sage" }, // 0 — brand-adjacent
  { hsl: "217 70% 60%", label: "azure" }, // 1
  { hsl: "280 55% 62%", label: "violet" }, // 2
  { hsl: "38 80% 58%", label: "amber" }, // 3
  { hsl: "350 65% 60%", label: "rose" }, // 4
  { hsl: "180 55% 52%", label: "teal" }, // 5
  { hsl: "48 70% 56%", label: "mustard" }, // 6
  { hsl: "300 45% 60%", label: "orchid" }, // 7
];

/** Multiplicative prime walk over the string. Stable + cheap. */
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    // 31 is a small prime; commonly used in Java-style hashCode
    // without the overflow. Modulo at the end keeps the result
    // bounded.
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Return the deck accent as an HSL triplet (no `hsl()` wrapper) for
 * the given deck id. Falls back to the brand sage (palette[0]) if
 * the input is empty.
 */
export function getDeckAccent(deckId: string): string {
  if (!deckId) return PALETTE[0].hsl;
  return PALETTE[hashSeed(deckId) % PALETTE.length].hsl;
}

/** Return the readable label for the accent (e.g. "sage", "azure"). */
export function getDeckAccentLabel(deckId: string): string {
  if (!deckId) return PALETTE[0].label;
  return PALETTE[hashSeed(deckId) % PALETTE.length].label;
}

/** Exported for tests + the per-deck settings page. */
export const DECK_ACCENT_PALETTE = PALETTE;
