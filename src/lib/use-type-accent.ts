"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CARD_TYPES, type CardType } from "@/lib/validation";

/**
 * Per-type accent color store, persisted to `localStorage` and
 * mirrored to CSS custom properties on `<html>`.
 *
 * Storage shape: a flat record `{ qa: "#4ebca5", choice: "#...", ... }`
 * The hook writes through to the DOM as `--type-accent-{type}` HSL
 * triplets (NOT raw hex) so the existing `hsl(var(--type-accent-...))`
 * Tailwind convention in the rest of the app keeps working.
 *
 * Why not raw hex: the `card-type-badge` and gallery tile use
 * `hsl(var(--type-accent-{type}) / 0.15)` style alpha-tinted
 * backgrounds. Storing HSL keeps that contract intact without a
 * runtime parser.
 *
 * SSR-safe: the hook reads from `window.localStorage` inside
 * `useEffect`, so server-rendered HTML always uses the CSS default
 * and the user's override flashes in after hydration. The flash is
 * < 16ms in practice.
 */

export type TypeAccentMap = Record<CardType, string>;

const STORAGE_KEY = "remem.type-accent.v1";

const DEFAULTS: TypeAccentMap = {
  // HSL triplet form (no `hsl()` wrapper) — must match the values
  // in `src/app/globals.css` under `:root` / `[data-theme="light"]`.
  // Read from CSS at runtime in the layout so a future global.css
  // change automatically migrates the user override.
  qa: "162 50% 58%",
  choice: "217 80% 60%",
  multi_choice: "280 60% 62%",
  fill: "38 92% 56%",
  judge: "350 70% 60%",
};

function isValidTriplet(s: string): boolean {
  // Matches `H S% L%` (numbers, spaces, optional %).
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(s.trim());
}

function readStored(): TypeAccentMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TypeAccentMap>;
    // Validate every key; fall back to default for any malformed entry.
    const out: TypeAccentMap = { ...DEFAULTS };
    for (const t of CARD_TYPES) {
      const v = parsed[t];
      if (typeof v === "string" && isValidTriplet(v)) {
        out[t] = v;
      }
    }
    return out;
  } catch {
    return null;
  }
}

function writeStored(map: TypeAccentMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or disabled storage — fail silently. The DOM-level
    // mirror still applies for the current session.
  }
}

function applyToRoot(map: TypeAccentMap): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const t of CARD_TYPES) {
    root.style.setProperty(`--type-accent-${t}`, map[t]);
  }
}

export interface TypeAccentApi {
  /** Current effective map (defaults + user overrides). */
  colors: TypeAccentMap;
  /** Replace one type's accent. Persists + re-applies immediately. */
  setColor: (type: CardType, hsl: string) => void;
  /** Reset all types to the CSS-defined defaults. */
  resetAll: () => void;
  /** True once the hook has read from localStorage (post-hydration). */
  hydrated: boolean;
}

export function useTypeAccent(): TypeAccentApi {
  const [colors, setColors] = useState<TypeAccentMap>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // On mount: read localStorage and apply to <html>.
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setColors(stored);
      applyToRoot(stored);
    } else {
      // First visit: mirror defaults to root so non-React surfaces
      // (e.g. the dev server's SSR output) align.
      applyToRoot(DEFAULTS);
    }
    setHydrated(true);
  }, []);

  const setColor = useCallback((type: CardType, hsl: string) => {
    if (!isValidTriplet(hsl)) return;
    setColors((prev) => {
      const next = { ...prev, [type]: hsl };
      writeStored(next);
      applyToRoot(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setColors(DEFAULTS);
    applyToRoot(DEFAULTS);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return useMemo(
    () => ({ colors, setColor, resetAll, hydrated }),
    [colors, setColor, resetAll, hydrated]
  );
}
