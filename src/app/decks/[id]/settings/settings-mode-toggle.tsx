"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { updateSettingsModeAction } from "./actions";

export interface SettingsModeToggleProps {
  deckId: string;
  mode: "simple" | "pro";
}

// D-16: segmented simple|专业 toggle (role=radiogroup).
// Mirrors the 2-cell inline pattern from card-type-segmented.tsx.
// Dispatches updateSettingsModeAction then router.refresh() so the
// parent server component re-reads deck.settingsMode from the DB.
export function SettingsModeToggle({ deckId, mode }: SettingsModeToggleProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleModeChange = (m: "simple" | "pro") => {
    if (m === mode) return; // no-op if already active
    const fd = new FormData();
    fd.set("deckId", deckId);
    fd.set("settingsMode", m);
    startTransition(async () => {
      const result = await updateSettingsModeAction(null, fd);
      if (!result?.error) {
        router.refresh();
      }
    });
  };

  return (
    <div
      role="radiogroup"
      aria-label="设置模式"
      className="grid grid-cols-2 gap-s"
    >
      {(["simple", "pro"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => handleModeChange(m)}
            className={cn(
              "h-11 md:h-12 w-full rounded-xl border text-center text-sm font-medium transition-all inline-flex items-center justify-center",
              active
                ? "glass-card border-brand text-brand shadow-inner"
                : "border-border bg-card/40 text-foreground hover:border-brand hover:bg-card/60"
            )}
          >
            {m === "simple" ? "简单" : "专业"}
          </button>
        );
      })}
    </div>
  );
}
