"use client";

import { useEffect, useRef, useState } from "react";
import { previewStudyPlanAction, type StudyPlanPreviewState } from "./actions";
import { cn } from "@/lib/utils";

/**
 * Phase 08-01: live "今日待学" preview under the Study Plan form.
 *
 * The form mounts this component and re-fires the server action
 * whenever any of the 5 fields change. We debounce the call
 * client-side at 400ms so a rapid drag through the newPerDay
 * number input collapses into a single round-trip.
 *
 * The preview only ever sees { total, newCount, reviewCount,
 * learnCount } from the server (buildQueue's queue contents are
 * never sent down — that would leak card content to a user that
 * hasn't started studying). The progress bar is a 1px hairline
 * showing the new-vs-review split, NOT a filled "X out of Y"
 * track (filled tracks are a banned LLM tell per the project's
 * design taste rules).
 */

export interface StudyPlanPreviewFields {
  newPerDay: number;
  reviewsPerDay: number;
  requestRetention: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
}

export interface StudyPlanPreviewProps {
  deckId: string;
  fields: StudyPlanPreviewFields;
}

export function StudyPlanPreview({ deckId, fields }: StudyPlanPreviewProps) {
  const [state, setState] = useState<StudyPlanPreviewState>(null);
  const [pending, setPending] = useState(false);
  // Track the most recent fields snapshot we fired for, so a stale
  // 400ms timer can't overwrite a fresher result. Each render
  // bumps `seqRef.current` and the in-flight callback checks the
  // seq it was launched under.
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      // Bail if a newer fields change already scheduled a fresher
      // request — keeps late responses from stomping on a newer
      // preview.
      if (seqRef.current !== seq) return;
      setPending(true);
      const fd = new FormData();
      fd.set("deckId", deckId);
      fd.set("newPerDay", String(fields.newPerDay));
      fd.set("reviewsPerDay", String(fields.reviewsPerDay));
      fd.set("requestRetention", String(fields.requestRetention));
      fd.set("enableFuzz", fields.enableFuzz ? "true" : "false");
      fd.set("enableShortTerm", fields.enableShortTerm ? "true" : "false");
      const result = await previewStudyPlanAction(null, fd);
      // Bail again in case a newer fields change raced us between
      // the await and the setState.
      if (seqRef.current !== seq) return;
      setState(result);
      setPending(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [deckId, fields]);

  const total = state?.total;
  const newCount = state?.newCount ?? 0;
  const reviewCount = state?.reviewCount ?? 0;
  const learnCount = state?.learnCount ?? 0;
  // The 1px bar shows the queue's new-vs-review allocation
  // (learning has no cap and is shown separately in the subtitle).
  // When both are 0, the bar collapses to 0% so we don't render
  // a misleading "full" bar.
  const allocatedSum = newCount + reviewCount;
  const newShare = allocatedSum === 0 ? 0 : (newCount / allocatedSum) * 100;

  return (
    <div
      className={cn(
        "glass-card rounded-xl p-m space-y-3",
        "border border-border/40"
      )}
      data-pending={pending ? "true" : "false"}
      aria-busy={pending}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">今日待学</span>
        {pending ? (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            aria-live="polite"
          >
            计算中…
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-3">
        <span
          className="font-mono text-3xl font-semibold tabular-nums text-foreground"
          aria-live="polite"
        >
          {total ?? "—"}
        </span>
        <span className="text-sm text-muted-foreground">张</span>
      </div>

      <p
        className="text-xs text-muted-foreground"
        aria-live="polite"
      >
        {state
          ? `${newCount} 新 + ${reviewCount} 复习 · 学习中 ${learnCount} 张`
          : "调整任意字段后会立即重新计算。"}
      </p>

      {/* 1px hairline progress, brand-colored. No filled track (avoids
          the "scoring-bar" anti-pattern); the unallocated remainder is
          invisible, so the user reads the bar as "this is how the
          queue is split", not "this is how full the queue is". */}
      <div className="space-y-1">
        <div
          className="h-px w-full bg-border"
          role="presentation"
          aria-hidden
        >
          <div
            className="h-px bg-brand transition-[width] duration-300 ease-out"
            style={{ width: `${newShare}%` }}
          />
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full bg-brand"
              aria-hidden
            />
            新
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
              aria-hidden
            />
            复习
          </span>
          <span className="ml-auto text-muted-foreground/70">
            {allocatedSum > 0
              ? `${newCount}/${allocatedSum}`
              : "—"}
          </span>
        </div>
      </div>

      {state?.error ? (
        <p
          className="text-xs text-destructive"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
