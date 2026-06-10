"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Hash, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared row primitive for the choice / multi_choice / fill sub-forms.
 *
 * Layout: control slot (radio / checkbox / spacer) on the left, an Input
 * with `flex-1` in the middle, an optional "插入选项引用" button (when
 * allOptionLabels is provided), a Pin toggle on the LAST row, and a
 * ghost `×` Button on the right.
 *
 * The placeholder insertion button (Phase 04-07 Item 1) lets users
 * insert a `{{#N}}` reference to another option's position directly
 * from the option's input — supersedes the old toolbar dropdown that
 * was confusingly placed in the question editor.
 */
export interface OptionRowProps {
  index: number;
  value: string;
  onValueChange: (v: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  control: React.ReactNode;
  placeholder?: string;
  ariaLabel: string;
  removeAriaLabel: string;
  /** Phase 04-06 Feature B: pin-last toggle is rendered on the last row. */
  isLast?: boolean;
  pinLastOption?: boolean;
  onPinLastChange?: (v: boolean) => void;
  /**
   * Phase 04-07 Item 1: when provided, the row renders a "插入选项引用"
   * button that opens a popover listing all current options and lets
   * the user insert a `{{#N}}` reference at the current cursor. Pass
   * the parent form's `options` array (1-indexed positions are derived).
   */
  allOptionLabels?: string[];
}

function insertAtCursor(
  el: HTMLInputElement,
  text: string,
  emit: (v: string) => void
): void {
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? s;
  const value = el.value;
  const next = value.slice(0, s) + text + value.slice(e);
  emit(next);
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = s + text.length;
    el.selectionEnd = s + text.length;
  });
}

export function OptionRow({
  index,
  value,
  onValueChange,
  onRemove,
  canRemove,
  control,
  placeholder,
  ariaLabel,
  removeAriaLabel,
  isLast,
  pinLastOption,
  onPinLastChange,
  allOptionLabels,
}: OptionRowProps) {
  const showPin = Boolean(isLast && onPinLastChange);
  const showRefMenu = Boolean(
    allOptionLabels && allOptionLabels.length > 0
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [refMenuOpen, setRefMenuOpen] = useState(false);
  const refMenuRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!refMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (refMenuRef.current && !refMenuRef.current.contains(target)) {
        setRefMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRefMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [refMenuOpen]);

  function insertOptionRef(n: number) {
    const el = inputRef.current;
    if (!el) return;
    insertAtCursor(el, `{{#${n}}}`, onValueChange);
    setRefMenuOpen(false);
  }

  return (
    <div className="space-y-xxs">
      <div className="flex items-center gap-m rounded-xl border border-transparent p-xs transition-colors hover:border-border">
        {control}
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="flex-1"
          placeholder={placeholder ?? `选项 ${index + 1}`}
          aria-label={ariaLabel}
        />
        {showRefMenu ? (
          <div className="relative shrink-0" ref={refMenuRef}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="插入选项引用"
              aria-expanded={refMenuOpen}
              aria-haspopup="menu"
              title="插入 `{{#N}}` 引用其它选项位置"
              onClick={() => setRefMenuOpen((v) => !v)}
            >
              <Hash className="h-4 w-4" aria-hidden />
            </Button>
            {refMenuOpen ? (
              <div
                role="menu"
                aria-label="选项占位符"
                className="absolute right-0 top-full z-20 mt-xxs w-64 rounded-xl border border-border bg-card p-xs shadow-lg glass-dropdown"
              >
                <p className="px-s pb-xs text-xs uppercase tracking-wide text-muted-foreground">
                  {"{{#N}} - 按位置引用选项"}
                </p>
                <ul className="space-y-xxs">
                  {allOptionLabels!.map((label, i) => {
                    const isSelf = i === index;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => insertOptionRef(i + 1)}
                          disabled={isSelf}
                          className={cn(
                            "flex w-full items-center gap-s rounded-sm px-s py-xs text-left text-sm",
                            isSelf
                              ? "cursor-not-allowed text-muted-foreground/50"
                              : "hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0 font-mono text-xs",
                              isSelf ? "text-muted-foreground/50" : "text-brand"
                            )}
                          >
                            {"{{#"}
                            {i + 1}
                            {"}}"}
                          </span>
                          <span className="truncate">
                            {label.trim() || `选项 ${i + 1}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {showPin ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onPinLastChange?.(!pinLastOption)}
              aria-pressed={Boolean(pinLastOption)}
              aria-label={pinLastOption ? "取消置底" : "打乱时置底"}
              title={
                pinLastOption
                  ? "打乱时此项强制置底"
                  : "打乱时跟随其他项 (点击置底)"
              }
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                pinLastOption
                  ? "bg-brand text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Pin className="h-4 w-4" aria-hidden />
            </button>
            {pinLastOption ? (
              <span
                className="font-mono text-xs uppercase tracking-wide text-brand"
                aria-hidden
              >
                已置底
              </span>
            ) : (
              <span
                className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
                aria-hidden
              >
                末尾
              </span>
            )}
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canRemove}
          aria-label={removeAriaLabel}
          onClick={onRemove}
        >
          ×
        </Button>
      </div>
      {showPin && pinLastOption ? (
        <p className="pl-l text-xs text-muted-foreground">
          打乱时该选项强制置底
        </p>
      ) : null}
      {showRefMenu && index === 0 ? (
        <p className="pl-l text-xs text-muted-foreground">
          提示: 点击 <Hash className="inline h-3 w-3" aria-hidden /> 插入{" "}
          <span className="font-mono text-brand">{"{{#N}}"}</span>{" "}
          引用其它选项位置 (卡片渲染时按乱序后的实际位置替换)
        </p>
      ) : null}
    </div>
  );
}
