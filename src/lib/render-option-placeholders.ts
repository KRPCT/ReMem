/**
 * Phase 04-06 Feature C: option placeholder helper.
 *
 * The card form lets the author insert `{{#N}}` markers into the
 * question / explanation / option text. `N` is the 1-based position
 * of the option in the AUTHOR'S SOURCE LIST (the original
 * `data.options` array, before any shuffling). The placeholder
 * resolves to the LABEL of the source-N option as it appears on
 * screen after shuffle — so if the source-A option is currently
 * at display position 2, `{{#1}}` renders as the label for
 * position 2 (e.g. "B" if labels are A/B/C/D/...).
 *
 * The label is computed by the caller, not by this helper. The
 * helper just orchestrates: for each `{{#N}}`, compute
 * sourceIndex = N - 1, and call `sourceIndexToLabel(sourceIndex)`.
 * The caller passes a resolver that maps source index → label
 * string, which the UI then uses to render `{{#1}}` in any
 * context (question, back, option text).
 *
 * Decoupling rationale: the same `{{#N}}` text can appear in
 * many surfaces (question, option text, back content), and each
 * surface should resolve to the label that the user actually
 * sees in that context. Locking the helper to a particular label
 * scheme (LETTER[i], digit, etc.) would couple every future UI
 * change to a helper change.
 *
 * Example
 *   source options     = ["Alpha", "Beta", "Gamma (see {{#1}})"]
 *   permutation        = [2, 0, 1]    // source-2 (Gamma) at pos 0
 *   sourceIndexToLabel = (i) => {
 *     const p = displayPosByOriginal.get(i);
 *     if (p === undefined) return undefined;
 *     return LETTER[p] ?? String(p + 1);
 *   }
 *
 *   front              = "Bigger than {{#1}}?"
 *   → source-1 (Alpha) displayPos = 1
 *   → LETTER[1] = "B"
 *   → "Bigger than B?"
 *
 *   Gamma's source text "Gamma (see {{#1}})":
 *   → source-1 (Alpha) displayPos = 1
 *   → LETTER[1] = "B"
 *   → "Gamma (see B)"  (rendered in Gamma's slot at displayPos 0)
 *
 * Out-of-range N (no source-N exists) leaves the placeholder
 * literal: the resolver returns undefined and the helper keeps
 * `{{#N}}` intact so the author can spot the broken reference.
 */
export function renderOptionPlaceholders(
  content: string,
  sourceIndexToLabel: (sourceIndex: number) => string | undefined
): string {
  return content.replace(/\{\{#(\d+)\}\}/g, (whole, idx: string) => {
    const sourceIndex = Number.parseInt(idx, 10) - 1; // 0-based
    if (!Number.isFinite(sourceIndex) || sourceIndex < 0) {
      return whole;
    }
    return sourceIndexToLabel(sourceIndex) ?? whole;
  });
}
