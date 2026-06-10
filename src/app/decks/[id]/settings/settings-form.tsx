"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDeckAction } from "../actions";

interface SettingsFormProps {
  deck: {
    id: string;
    title: string;
    description: string | null;
    shuffleOptions: boolean;
  };
}

type SettingsState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

export function SettingsForm({ deck }: SettingsFormProps) {
  const router = useRouter();
  const [shuffle, setShuffle] = useState(deck.shuffleOptions);
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateDeckAction,
    null
  );

  // After a successful save (state becomes null AND we're not pending), force
  // a router refresh so the server component re-fetches the deck and the
  // form's `deck` prop picks up the newly-persisted description. Without
  // this, React 19's automatic form reset (after a successful action) puts
  // the input back to the OLD `deck.description ?? ""` defaultValue, and
  // there's no other signal to push the fresh server data down into this
  // client component. (Regression found in Phase 3 UAT on 2026-06-06.)
  //
  // Track the previous state so we only fire on the success transition,
  // not on initial mount (state is null from the start).
  const prevState = useRef<SettingsState>(state);
  useEffect(() => {
    const wasPending = pending;
    const wasError = !!prevState.current?.error || !!prevState.current?.fieldErrors;
    const isError = !!state?.error || !!state?.fieldErrors;
    if (!wasPending && !wasError && prevState.current !== state && !isError) {
      // transitioned from a saved-state to a different saved-state (success)
      router.refresh();
    }
    prevState.current = state;
  }, [state, pending, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={deck.id} />
      <input
        type="hidden"
        name="shuffleOptions"
        value={shuffle ? "true" : "false"}
      />

      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          name="title"
          defaultValue={deck.title}
          required
          aria-required="true"
          maxLength={120}
        />
        {state?.fieldErrors?.title ? (
          <p className="text-xs text-destructive" role="alert">
            {state.fieldErrors.title}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">描述（可选）</Label>
        <Input
          id="description"
          name="description"
          defaultValue={deck.description ?? ""}
          maxLength={2000}
        />
        {state?.fieldErrors?.description ? (
          <p className="text-xs text-destructive" role="alert">
            {state.fieldErrors.description}
          </p>
        ) : null}
      </div>

      <label
        htmlFor="shuffleOptions"
        className="flex h-11 cursor-pointer items-center gap-m rounded-xl border border-border bg-card/40 px-m text-sm transition-colors hover:bg-card/60"
      >
        <input
          id="shuffleOptions"
          type="checkbox"
          checked={shuffle}
          onChange={(e) => setShuffle(e.target.checked)}
          className="h-4 w-4 rounded-sm"
        />
        <span>
          学习时乱序选项
          <span className="ml-2 text-xs text-muted-foreground">
            （单选 / 多选卡片的所有选项在学习时随机排序）
          </span>
        </span>
      </label>

      {state?.error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>
    </form>
  );
}
