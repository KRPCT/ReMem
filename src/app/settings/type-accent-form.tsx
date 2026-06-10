"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTypeAccent, type TypeAccentMap } from "@/lib/use-type-accent";
import { CARD_TYPES, type CardType } from "@/lib/validation";

const TYPE_LABEL: Record<CardType, string> = {
  qa: "问答",
  choice: "单选",
  multi_choice: "多选",
  fill: "填空",
  judge: "判断",
};

/**
 * 5 inline <input type="color"> pickers. Each writes to the
 * `useTypeAccent` store, which persists to localStorage AND mirrors
 * the value to a CSS variable on `<html>`. Changes are visible
 * immediately across the app (the gallery tile's top border, the
 * card-type-badge tint, the deck list's accent strip).
 *
 * The native `<input type="color">` is used so we don't pull in a
 * heavy color-picker library — it's a no-deps primitive that ships
 * with all evergreen browsers and respects
 * `prefers-color-scheme` for the picker chrome.
 *
 * Client component. Hooks: useTypeAccent.
 */
export function TypeAccentForm() {
  const { colors, setColor, resetAll, hydrated } = useTypeAccent();
  const [draft, setDraft] = useState<TypeAccentMap>(colors);

  // Keep the local draft in sync with the persisted store after
  // hydration. The first render uses the CSS defaults; the second
  // (post-hydration) reflects the user's localStorage override.
  useEffect(() => {
    setDraft(colors);
  }, [colors]);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>题型强调色</CardTitle>
        <p className="text-sm text-muted-foreground">
          每张卡片顶部的 4px 强调色横条 + 徽标 tint。
          更改后立即在画廊和列表中生效。颜色存储在本地浏览器（localStorage），
          不会上传到服务器。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {CARD_TYPES.map((t) => {
            const hsl = draft[t];
            // The native color picker only understands `#hex`; the
            // store keeps HSL triplets. Convert HSL -> hex on read
            // and let the store convert back on write.
            const hex = hslToHex(hsl);
            return (
              <div
                key={t}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block h-6 w-1.5 rounded-full"
                    style={{ backgroundColor: `hsl(${hsl})` }}
                    aria-hidden
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{TYPE_LABEL[t]}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t}
                    </p>
                  </div>
                </div>
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => {
                    const next = hexToHsl(e.target.value);
                    setDraft((d) => ({ ...d, [t]: next }));
                  }}
                  onBlur={() => setColor(t, draft[t])}
                  aria-label={`${TYPE_LABEL[t]} 强调色`}
                  className="h-8 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-s border-t border-border/40 pt-4">
          <p className="text-xs text-muted-foreground">
            {hydrated ? "已应用" : "读取中..."}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetAll}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            <span className="ml-1">恢复默认</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Convert `H S% L%` (HSL triplet) to a `#rrggbb` hex string. */
function hslToHex(hsl: string): string {
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

/** Convert `#rrggbb` hex to `H S% L%` (rounded to integers). */
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
