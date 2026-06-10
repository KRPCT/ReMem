"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DECK_ACCENT_PALETTE,
} from "@/lib/deck-accent";
import { updateDeckColorAction } from "../actions";
import { cn } from "@/lib/utils";

interface DeckColorFormProps {
  deckId: string;
  /** Current persisted color (from DB). Null = user hasn't customized. */
  currentColor: string | null;
  /** Hash-derived fallback shown when `currentColor` is null. */
  fallbackColor: string;
}

type ColorState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

export function DeckColorForm({
  deckId,
  currentColor,
  fallbackColor,
}: DeckColorFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ColorState, FormData>(
    updateDeckColorAction,
    null
  );
  const [draft, setDraft] = useState<string>(currentColor ?? "");
  const prevState = useRef<ColorState>(state);

  // Same success-detection pattern as the main settings form: force
  // a router refresh after a successful save so the persisted
  // value flows back into the parent server component.
  useEffect(() => {
    const wasPending = pending;
    const wasError = !!prevState.current?.error || !!prevState.current?.fieldErrors;
    const isError = !!state?.error || !!state?.fieldErrors;
    if (!wasPending && !wasError && prevState.current !== state && !isError) {
      router.refresh();
    }
    prevState.current = state;
  }, [state, pending, router]);

  // HSL -> hex for the native color picker (which only understands #rrggbb).
  const effectiveDraft = draft || currentColor || fallbackColor;
  const effectiveHex = hslToHex(effectiveDraft);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={deckId} />
      <input type="hidden" name="themeColor" value={draft} />

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {DECK_ACCENT_PALETTE.map((p) => {
          const selected = effectiveDraft === p.hsl;
          return (
            <button
              key={p.hsl}
              type="button"
              onClick={() => setDraft(p.hsl)}
              aria-label={`使用 ${p.label} 主题色`}
              aria-pressed={selected}
              className={cn(
                "group flex h-12 items-center justify-center rounded-xl border bg-card/30 transition-all",
                "hover:scale-[1.04] hover:border-foreground/40",
                selected
                  ? "border-foreground/60 ring-2 ring-ring ring-offset-2 ring-offset-background"
                  : "border-border/40"
              )}
            >
              <span
                className="h-7 w-7 rounded-full"
                style={{ backgroundColor: `hsl(${p.hsl})` }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="customColor"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            自定义
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="customColor"
              value={effectiveHex}
              onChange={(e) => setDraft(hexToHsl(e.target.value))}
              className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
              aria-label="自定义颜色"
            />
            <span className="font-mono text-xs text-muted-foreground">
              {effectiveDraft || "使用默认"}
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-s">
          {currentColor ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDraft("")}
              disabled={pending}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              <span className="ml-1">恢复默认</span>
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      {state?.error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}
      {state?.fieldErrors?.themeColor ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {state.fieldErrors.themeColor}
        </p>
      ) : null}
    </form>
  );
}

/** HSL triplet (`H S% L%`) -> `#rrggbb` for the native color picker. */
function hslToHex(hsl: string): string {
  if (!/^\d+\s+\d+%\s+\d+%$/.test(hsl.trim())) return "#000000";
  const [hStr, sStr, lStr] = hsl.trim().split(/\s+/);
  const h = Number(hStr);
  const s = Number(sStr.replace("%", "")) / 100;
  const l = Number(lStr.replace("%", "")) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** `#rrggbb` -> HSL triplet (`H S% L%`) rounded to integers. */
function hexToHsl(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
