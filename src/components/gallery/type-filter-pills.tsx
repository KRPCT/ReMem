"use client";

import type { CardType } from "@/lib/validation";

interface TypeFilterPillsProps {
  /** The order in which to render pills (typically `CARD_TYPES`). */
  types: readonly CardType[];
  /** The currently-active set. Pass an empty set for "no type filter". */
  active: ReadonlySet<CardType>;
  /** Count per type so the pill label can show `qa (12)`. */
  counts: Record<CardType, number>;
  /** Called when a pill is clicked. Toggling is owned by the parent. */
  onToggle: (type: CardType) => void;
}

/**
 * Server-safe filter pill row.
 *
 * The active / inactive class strings are intentionally inlined
 * (NOT factored into a `cn()` call) so they remain grep-able for
 * any future visual audit. Both class strings match the long-form
 * treatment used in the legacy `card-list.tsx` to keep visual
 * parity.
 *
 * Parent owns the state. The component itself does NOT track
 * anything — toggle is delegated through `onToggle`. This means
 * the pill row works inside both the row list and the gallery
 * without forking state code.
 */
export function TypeFilterPills({
  types,
  active,
  counts,
  onToggle,
}: TypeFilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-s">
      {types.map((t) => {
        const isActive = active.has(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            aria-pressed={isActive}
            className={
              isActive
                ? "h-8 rounded-full border border-brand bg-brand px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground transition-colors"
                : "h-8 rounded-full border border-border bg-card/40 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors hover:border-brand"
            }
          >
            {t} ({counts[t]})
          </button>
        );
      })}
    </div>
  );
}

export default TypeFilterPills;
