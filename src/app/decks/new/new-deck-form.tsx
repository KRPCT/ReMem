"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NoteTypeJson } from "@/lib/validation";
import { createDeckAction, type CreateDeckState } from "./actions";

interface NewDeckFormProps {
  noteTypeJson: NoteTypeJson;
}

export function NewDeckForm({ noteTypeJson }: NewDeckFormProps) {
  const [state, formAction, pending] = useActionState<CreateDeckState, FormData>(
    createDeckAction,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <input
        type="hidden"
        name="noteTypeJson"
        value={JSON.stringify(noteTypeJson)}
      />

      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          name="title"
          required
          aria-required="true"
          maxLength={120}
          placeholder="例如：日语 N1 词汇"
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
          maxLength={2000}
          placeholder="一句话说明这个牌组的用途"
        />
        {state?.fieldErrors?.description ? (
          <p className="text-xs text-destructive" role="alert">
            {state.fieldErrors.description}
          </p>
        ) : null}
      </div>

      {state?.error ? (
        <p className="text-sm text-destructive" role="alert" aria-live="polite">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href="/decks">
          <Button type="button" variant="ghost">
            取消
          </Button>
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "创建中…" : "创建牌组"}
        </Button>
      </div>
    </form>
  );
}
