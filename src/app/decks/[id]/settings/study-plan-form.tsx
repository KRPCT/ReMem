"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Direct import from the recommendations sub-module — the public
// `@/lib/fsrs` barrel re-exports scheduler.ts and undo.ts which
// both have `import "server-only"`, and Next.js refuses to bundle
// a server-only module into a client component. The recommendations
// file has no server-only marker and is safe to import here.
import { FSRS_RECOMMENDED_VALUES } from "@/lib/fsrs/recommendations";
import {
  updateStudyPlanAction,
  recommendStudyPlanAction,
  type StudyPlanActionState,
  type RecommendStudyPlanState,
} from "./actions";
import { StudyPlanPreview } from "./study-plan-preview";

/**
 * Phase 08-01: Study Plan settings form.
 *
 * Renders 5 fields (newPerDay, reviewsPerDay, requestRetention,
 * enableFuzz, enableShortTerm) with a "FSRS 推荐" button that
 * fills the recommended values, a "重置" button that restores
 * the last-persisted initial values, and a primary "保存" submit
 * that runs the updateStudyPlanAction server action.
 *
 * Layout:
 *   - Two-column grid for the daily caps (newPerDay + reviewsPerDay
 *     are conceptually paired) and the scheduler options (the two
 *     booleans are also paired). 1-column on < 768px.
 *   - requestRetention is full-width because its label needs a
 *     helper line ("期望回忆保留率") to explain the 0.7..0.97 bound.
 *   - Booleans use the same label-as-container checkbox pattern
 *     as deck-color-form.tsx — accessible, mobile-tap-friendly,
 *     and visually consistent with the rest of the settings page.
 *
 * The form owns the controlled state (5 fields), debounce-handles
 * the preview re-fire via <StudyPlanPreview>, and submits to the
 * server action with the success-detection pattern from
 * settings-form.tsx (router.refresh() on a clean state transition).
 */

// Mutable shape used by the form's useState. Identical structure
// to StudyPlanRecommended, but the booleans are widened from the
// `as const` literal types to plain `boolean` so onChange handlers
// can write `e.target.checked` without type errors.
// Phase 08-04: 6th field firstSessionTargetProgress (0.5..1.0,
// 0.80 default). The smart-recommend engine returns this and
// the form holds it alongside the other 5.
type StudyPlanFormState = {
  newPerDay: number;
  reviewsPerDay: number;
  requestRetention: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  firstSessionTargetProgress: number;
  // Phase 14: study-UX rating-bar collapse (2|3|4) + new-card remember-as-easy.
  ratingButtons: number;
  newRememberAsEasy: boolean;
};

export interface StudyPlanFormProps {
  deckId: string;
  /** Last-persisted values from the DB (or default fallback on a
   *  deck with no StudyPlan row). The "重置" button restores this. */
  initial: StudyPlanFormState;
  /** D-02: when true, only the two daily-cap fields are visible.
   *  The 6 hidden inputs still render so saved advanced values are
   *  preserved (not zeroed) across a simple <-> pro round trip. */
  simpleMode?: boolean;
}

export function StudyPlanForm({ deckId, initial, simpleMode = false }: StudyPlanFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<StudyPlanFormState>({ ...initial });
  const [state, formAction, pending] = useActionState<StudyPlanActionState, FormData>(
    updateStudyPlanAction,
    null
  );
  const prevState = useRef<StudyPlanActionState>(state);

  // After a successful save, force a router.refresh so the
  // server component re-fetches the deck and the form's
  // `initial` prop picks up the freshly persisted values.
  // Same pattern as settings-form.tsx and deck-color-form.tsx.
  useEffect(() => {
    const wasPending = pending;
    const wasError =
      !!prevState.current?.error ||
      !!prevState.current?.fieldErrors;
    const isError = !!state?.error || !!state?.fieldErrors;
    if (
      !wasPending &&
      !wasError &&
      prevState.current !== state &&
      !isError
    ) {
      router.refresh();
    }
    prevState.current = state;
  }, [state, pending, router]);

  const onApplyRecommended = () => {
    // FSRS 6 static defaults: 5 fields + 0.80 threshold (the
    // schema default for firstSessionTargetProgress).
    setFields((f) => ({
      ...f,
      ...FSRS_RECOMMENDED_VALUES,
      firstSessionTargetProgress: 0.8,
    }));
  };

  // Phase 08-04: "智能推荐 v6" button. Calls the server action
  // for per-user-history recommendations; updates the form
  // fields from the response. The button is disabled while the
  // request is in flight (isPending) so the user can't fire it
  // multiple times in parallel.
  const [recommendState, recommendAction, recommendPending] = useActionState<
    RecommendStudyPlanState,
    FormData
  >(recommendStudyPlanAction, null);
  // useActionState's dispatched function must run inside a transition
  // (Next.js 15.5+ / React 19 hard requirement). Without startTransition,
  // isPending never flips and React logs a console error. We expose a
  // small wrapper so the button's onClick can fire-and-forget.
  const [, startRecommendTransition] = useTransition();
  const [recommendRationale, setRecommendRationale] = useState<string | null>(
    null
  );
  useEffect(() => {
    if (recommendState?.ok && recommendState.values) {
      const v = recommendState.values;
      setFields((f) => ({
        ...f,
        newPerDay: v.newPerDay,
        reviewsPerDay: v.reviewsPerDay,
        requestRetention: v.requestRetention,
        enableFuzz: v.enableFuzz,
        enableShortTerm: v.enableShortTerm,
        firstSessionTargetProgress: v.firstSessionTargetProgress,
      }));
      // Show a brief "why these numbers" line so the user can
      // see whether the recommendation came from their history
      // or fell back to Anki Desktop defaults.
      setRecommendRationale(
        v.source === "user-history-30d"
          ? `基于近 30 天历史: ${v.rationale.reviewsPerDay} · ${v.rationale.newPerDay}`
          : `历史不足 30 天: ${v.rationale.reviewsPerDay} · ${v.rationale.newPerDay}`
      );
    }
  }, [recommendState]);
  const onApplySmartRecommended = () => {
    const fd = new FormData();
    fd.set("deckId", deckId);
    // useActionState's dispatched function must run inside a transition
    // (React 19 hard rule); otherwise isPending never updates and the
    // console logs a "called outside of a transition" error. The wrapper
    // is the only correct way to call recommendAction from a click handler.
    startRecommendTransition(() => {
      recommendAction(fd);
    });
  };

  const onReset = () => {
    setFields(initial);
    setRecommendRationale(null);
  };

  const isDirty =
    fields.newPerDay !== initial.newPerDay ||
    fields.reviewsPerDay !== initial.reviewsPerDay ||
    fields.requestRetention !== initial.requestRetention ||
    fields.enableFuzz !== initial.enableFuzz ||
    fields.enableShortTerm !== initial.enableShortTerm ||
    fields.firstSessionTargetProgress !==
      initial.firstSessionTargetProgress ||
    fields.ratingButtons !== initial.ratingButtons ||
    fields.newRememberAsEasy !== initial.newRememberAsEasy;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="deckId" value={deckId} />
      <input
        type="hidden"
        name="newPerDay"
        value={String(fields.newPerDay)}
      />
      <input
        type="hidden"
        name="reviewsPerDay"
        value={String(fields.reviewsPerDay)}
      />
      <input
        type="hidden"
        name="requestRetention"
        value={String(fields.requestRetention)}
      />
      <input
        type="hidden"
        name="enableFuzz"
        value={fields.enableFuzz ? "true" : "false"}
      />
      <input
        type="hidden"
        name="enableShortTerm"
        value={fields.enableShortTerm ? "true" : "false"}
      />
      <input
        type="hidden"
        name="firstSessionTargetProgress"
        value={String(fields.firstSessionTargetProgress)}
      />
      <input
        type="hidden"
        name="ratingButtons"
        value={String(fields.ratingButtons)}
      />
      <input
        type="hidden"
        name="newRememberAsEasy"
        value={fields.newRememberAsEasy ? "true" : "false"}
      />

      {/* Phase 14: rating-bar key count + new-card remember-as-easy. Study UX,
          shown in both simple and pro mode (it changes how you grade, not an
          advanced FSRS scheduler knob). */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="ratingButtons-group">选项数量</Label>
          <div
            id="ratingButtons-group"
            role="group"
            aria-label="评分按钮数量"
            className="inline-flex rounded-lg border border-border bg-card/40 p-0.5"
          >
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  setFields((f) => ({ ...f, ratingButtons: n }))
                }
                aria-pressed={fields.ratingButtons === n}
                data-pressed={fields.ratingButtons === n}
                className="h-9 min-w-[3.5rem] rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors data-[pressed=true]:bg-brand/15 data-[pressed=true]:text-brand"
              >
                {n} 键
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            学习时评分按钮数量。2 键 = 不记得 / 记得；3 键 = 重来 / 良好 / 简单；
            4 键 = 完整 FSRS 评分。简并只改按钮，调度仍是 FSRS。
          </p>
        </div>

        <label
          htmlFor="newRememberAsEasy"
          className="flex cursor-pointer items-start gap-m rounded-xl border border-border bg-card/40 px-m py-3 text-sm transition-colors hover:bg-card/60"
        >
          <input
            id="newRememberAsEasy"
            type="checkbox"
            checked={fields.newRememberAsEasy}
            onChange={(e) =>
              setFields((f) => ({ ...f, newRememberAsEasy: e.target.checked }))
            }
            className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
          />
          <span>
            新学时「记得」视作「简单」
            <span className="mt-0.5 block text-xs text-muted-foreground">
              延长新卡首个复习间隔、减小复习压力
            </span>
          </span>
        </label>
      </div>

      {/* Daily caps — paired 2-col on >= md, 1-col on mobile. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="newPerDay">每日新卡上限</Label>
          <Input
            id="newPerDay"
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            step={1}
            value={fields.newPerDay}
            onChange={(e) =>
              setFields((f) => ({
                ...f,
                newPerDay: Number(e.target.value) || 0,
              }))
            }
            aria-describedby="newPerDay-hint"
          />
          <p
            id="newPerDay-hint"
            className="text-xs text-muted-foreground"
          >
            每天引入的新卡片数，0 表示暂停。
          </p>
          {state?.fieldErrors?.newPerDay ? (
            <p className="text-xs text-destructive" role="alert">
              {state.fieldErrors.newPerDay}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reviewsPerDay">每日复习上限</Label>
          <Input
            id="reviewsPerDay"
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            step={1}
            value={fields.reviewsPerDay}
            onChange={(e) =>
              setFields((f) => ({
                ...f,
                reviewsPerDay: Number(e.target.value) || 0,
              }))
            }
            aria-describedby="reviewsPerDay-hint"
          />
          <p
            id="reviewsPerDay-hint"
            className="text-xs text-muted-foreground"
          >
            每天最多复习的到期卡片数，0 表示暂停。
          </p>
          {state?.fieldErrors?.reviewsPerDay ? (
            <p className="text-xs text-destructive" role="alert">
              {state.fieldErrors.reviewsPerDay}
            </p>
          ) : null}
        </div>
      </div>

      {/* D-02: Advanced FSRS fields — hidden in simple mode.
          The 6 hidden inputs above always render so saved values
          are preserved (not zeroed) when the user is in simple mode. */}
      {!simpleMode && (
        <>
          {/* Retention — full width with a long helper line so the
              decimal bound and FSRS intuition are obvious. */}
          <div className="space-y-2">
            <Label htmlFor="requestRetention">期望回忆保留率</Label>
            <Input
              id="requestRetention"
              type="number"
              inputMode="decimal"
              min={0.7}
              max={0.97}
              step={0.01}
              value={fields.requestRetention}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  requestRetention: Number(e.target.value) || 0.9,
                }))
              }
              aria-describedby="requestRetention-hint"
            />
            <p
              id="requestRetention-hint"
              className="text-xs text-muted-foreground"
            >
              0.7 到 0.97。FSRS 用此值计算每次复习的间隔，默认 0.9。
            </p>
            {state?.fieldErrors?.requestRetention ? (
              <p className="text-xs text-destructive" role="alert">
                {state.fieldErrors.requestRetention}
              </p>
            ) : null}
          </div>

          {/* Scheduler switches — paired 2-col on >= md, 1-col on mobile.
              Use the deck-color-form label-as-container pattern so the
              whole row is tappable on mobile and visually consistent
              with the rest of the settings page. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label
              htmlFor="enableFuzz"
              className="flex h-11 cursor-pointer items-center gap-m rounded-xl border border-border bg-card/40 px-m text-sm transition-colors hover:bg-card/60"
            >
              <input
                id="enableFuzz"
                type="checkbox"
                checked={fields.enableFuzz}
                onChange={(e) =>
                  setFields((f) => ({
                    ...f,
                    enableFuzz: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded-sm"
              />
              <span>
                启用间隔模糊
                <span className="ml-2 text-xs text-muted-foreground">
                  避免复习卡扎堆
                </span>
              </span>
            </label>

            <label
              htmlFor="enableShortTerm"
              className="flex h-11 cursor-pointer items-center gap-m rounded-xl border border-border bg-card/40 px-m text-sm transition-colors hover:bg-card/60"
            >
              <input
                id="enableShortTerm"
                type="checkbox"
                checked={fields.enableShortTerm}
                onChange={(e) =>
                  setFields((f) => ({
                    ...f,
                    enableShortTerm: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded-sm"
              />
              <span>
                启用短期步进
                <span className="ml-2 text-xs text-muted-foreground">
                  新卡 / 再学习用 1m/10m 步进
                </span>
              </span>
            </label>
          </div>

          {/* Phase 08-04: first-session target progress threshold.
              Full-width with helper line so the 0.5..1.0 bound and
              "new card graduates to review" intuition are obvious. */}
          <div className="space-y-2">
            <Label htmlFor="firstSessionTargetProgress">首次学习达成阈值</Label>
            <Input
              id="firstSessionTargetProgress"
              type="number"
              inputMode="decimal"
              min={0.5}
              max={1.0}
              step={0.01}
              value={fields.firstSessionTargetProgress}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  firstSessionTargetProgress: Number(e.target.value) || 0.8,
                }))
              }
              aria-describedby="firstSessionTargetProgress-hint"
            />
            <p
              id="firstSessionTargetProgress-hint"
              className="text-xs text-muted-foreground"
            >
              0.5 到 1.0。卡片 FSRS 6 进度达到此值后,从新卡桶转入复习桶,默认 0.80。
            </p>
            {state?.fieldErrors?.firstSessionTargetProgress ? (
              <p className="text-xs text-destructive" role="alert">
                {state.fieldErrors.firstSessionTargetProgress}
              </p>
            ) : null}
          </div>
        </>
      )}

      {state?.error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-s">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onApplySmartRecommended}
          disabled={pending || recommendPending}
          data-testid="study-plan-smart-recommend"
        >
          <Brain className="h-4 w-4" aria-hidden />
          <span className="ml-1">
            {recommendPending ? "计算中…" : "智能推荐 v6"}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onApplyRecommended}
          disabled={pending}
          data-testid="study-plan-recommend"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="ml-1">FSRS 推荐</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={pending || !isDirty}
          data-testid="study-plan-reset"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          <span className="ml-1">重置</span>
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          data-testid="study-plan-save"
        >
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>

      {recommendRationale ? (
        <p
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
          role="status"
        >
          {recommendRationale}
        </p>
      ) : null}

      <StudyPlanPreview deckId={deckId} fields={fields} />
    </form>
  );
}
