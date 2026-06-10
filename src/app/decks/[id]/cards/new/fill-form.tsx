"use client";

import { memo, useMemo, useRef, useCallback } from "react";
import { Brackets, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/markdown-editor";
import { OptionRow } from "./option-row";

export type FillFormValue = {
  type: "fill";
  answers: string[];
};

export interface FillFormProps {
  value: FillFormValue;
  onChange: (v: FillFormValue) => void;
  fieldErrors?: Record<string, string>;
  /**
   * Phase 07: live question text. The fill form parses this to
   * derive the per-cloze "第 N 空" answer groups and to compute
   * the next cloze index for the "插入挖空" button.
   *
   * Owned by the parent (CardForm) — same as the create form's
   * `frontContent` state.
   */
  question: string;
  onQuestionChange: (v: string) => void;
}

const MIN_ANSWERS = 1;

/**
 * A single cloze parsed out of the question.
 *
 *   - `position`: 0-based render order (the user's "Nth blank in
 *     the question" order). Used to KEY the per-cloze groups.
 *   - `markerIndex`: 1-based N from the {{cN::}} or {{#N}} marker.
 *     This is the value the renderer (card-body.tsx) uses to look
 *     up the answer — `answers[markerIndex - 1]`.
 *   - `hint`: inline hint from the {{cN::hint}} form. Empty for
 *     {{#N}}.
 *
 * The form's data model: `answers[N-1]` is the primary for cloze N,
 * and `answers[N..M-1]` are the equivalents (where M is the next
 * higher markerIndex, or the array end).
 */
type ParsedCloze = {
  position: number;
  markerIndex: number;
  hint: string;
};

/**
 * Single-pass cloze parser. Recognizes both:
 *   - Anki-style: `{{cN::hint}}`  (canonical, has hint)
 *   - Index-only: `{{#N}}`          (shorter, no hint)
 *
 * Each match gets its REAL start/end position so duplicates
 * (`{{#1}} {{#1}}`) end up with distinct positions, which the
 * per-cloze groups need to map answers correctly.
 *
 * Overlap rule: a `{{#N}}` whose range overlaps a `{{cN::hint}}`
 * is dropped — the cN form is a strict superset (same range + a
 * hint slot), so it wins.
 */
function parseClozes(source: string): ParsedCloze[] {
  const found: Array<{
    start: number;
    end: number;
    markerIndex: number;
    hint: string;
  }> = [];

  // Pass 1: Anki-style `{{cN::hint}}`
  const cRe = /\{\{c(\d+)::([^}]*?)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = cRe.exec(source)) !== null) {
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      markerIndex: Number(m[1]),
      hint: m[2] ?? "",
    });
  }

  // Pass 2: short `{{#N}}` — skip ranges that overlap a cN:: form.
  const hashRe = /\{\{#(\d+)\}\}/g;
  while ((m = hashRe.exec(source)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlaps = found.some((c) => start < c.end && end > c.start);
    if (overlaps) continue;
    found.push({
      start,
      end,
      markerIndex: Number(m[1]),
      hint: "",
    });
  }

  // Sort by REAL source position, then assign 0-based render order.
  return found
    .sort((a, b) => a.start - b.start)
    .map((c, i) => ({
      position: i,
      markerIndex: c.markerIndex,
      hint: c.hint,
    }));
}

function highestClozeIndex(source: string): number {
  let max = 0;
  // Anki-style `{{cN::}}` and short `{{#N}}` — same digit rule.
  for (const m of source.match(/\{\{(?:c(\d+)::|#(\d+))\}/g) ?? []) {
    const n = Number(m.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Find the next cloze (in render order) with a higher markerIndex. */
function nextHigherMarker(
  clozes: ParsedCloze[],
  fromPosition: number
): ParsedCloze | null {
  const cur = clozes[fromPosition];
  if (!cur) return null;
  for (let i = fromPosition + 1; i < clozes.length; i++) {
    if (clozes[i].markerIndex > cur.markerIndex) return clozes[i];
  }
  return null;
}

/**
 * Equivalents for the cloze at `position` are
 *   answers[markerIndex .. nextHigherMarker.markerIndex - 2]
 * (inclusive on both ends) — i.e. everything between this cloze's
 * primary slot and the next cloze's primary slot.
 *
 * Example: c1, c3, c5 in a question with answers = [p1, e1a, p3, e3a, p5, e5a]:
 *   c1 equivalents: answers[1..1] = [e1a]   (1 element)
 *   c3 equivalents: answers[3..3] = [e3a]
 *   c5 equivalents: answers[5..end] = [e5a]
 */
function equivalentesFor(
  answers: string[],
  clozes: ParsedCloze[],
  position: number
): string[] {
  const cur = clozes[position];
  if (!cur) return [];
  const start = cur.markerIndex; // 0-based start of equivalents
  const next = nextHigherMarker(clozes, position);
  const end = next ? next.markerIndex - 1 : answers.length; // 0-based end (inclusive)
  if (end < start) return [];
  return answers.slice(start, end + 1);
}

/**
 * Where to splice in a new equivalent for the cloze at
 * `position` — right after the last existing equivalent, but
 * BEFORE the next cloze's primary. Falls back to the array end
 * for the last cloze.
 */
function equivalentInsertAt(
  clozes: ParsedCloze[],
  answersLen: number,
  position: number
): number {
  const cur = clozes[position];
  if (!cur) return answersLen;
  const eqCount = equivalentesFor(
    new Array(answersLen).fill(""),
    clozes,
    position
  ).length;
  let candidate = cur.markerIndex + eqCount;
  const next = nextHigherMarker(clozes, position);
  if (next) {
    candidate = Math.min(candidate, next.markerIndex - 1);
  } else {
    candidate = Math.min(candidate, answersLen);
  }
  return candidate;
}

/**
 * Update a single equivalent's value. `markerIndex` is the cloze's
 * 1-based N; `eqIndex` is the 0-based offset from the primary
 * (eqIndex=0 → answers[markerIndex]).
 */
function setEquivalent(
  answers: string[],
  markerIndex: number,
  eqIndex: number,
  value: string
): string[] {
  const flatIdx = markerIndex + eqIndex;
  const next = answers.slice();
  while (next.length <= flatIdx) next.push("");
  next[flatIdx] = value;
  return next;
}

function FillFormImpl({
  value,
  onChange,
  fieldErrors,
  question,
  onQuestionChange,
}: FillFormProps) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const clozes = useMemo(() => parseClozes(question), [question]);

  /**
   * Insert a `{{cN::}}` marker at the cursor and add a fresh
   * answer slot at the new cloze's 0-based position in `answers`
   * (NOT at the end — appending to the end would promote the
   * previous cloze's equivalents into the new slot, causing a
   * stray empty "等价答案" input to suddenly appear under it).
   */
  const handleInsertCloze = useCallback(() => {
    const nextIdx = highestClozeIndex(question) + 1;
    const insertAt = clozes.length;
    editorRef.current?.insertCloze(nextIdx);
    const nextAnswers = value.answers.slice();
    while (nextAnswers.length < insertAt) nextAnswers.push("");
    nextAnswers.splice(insertAt, 0, "");
    onChange({ ...value, answers: nextAnswers });
  }, [question, value, onChange, clozes]);

  const setClozeAnswer = useCallback(
    (markerIndex: number, ans: string) => {
      // Primary for cloze N lives at answers[N-1] — matches the
      // renderer's lookup `answers[c.index - 1]`.
      const flatIdx = markerIndex - 1;
      const next = value.answers.slice();
      while (next.length <= flatIdx) next.push("");
      next[flatIdx] = ans;
      onChange({ ...value, answers: next });
    },
    [value, onChange]
  );

  const addEquivalent = useCallback(
    (position: number) => {
      const insertAt = equivalentInsertAt(
        clozes,
        value.answers.length,
        position
      );
      const next = value.answers.slice();
      next.splice(insertAt, 0, "");
      onChange({ ...value, answers: next });
    },
    [value, onChange, clozes]
  );

  const setEquivalentValue = useCallback(
    (markerIndex: number, eqIndex: number, v: string) => {
      const next = setEquivalent(value.answers, markerIndex, eqIndex, v);
      onChange({ ...value, answers: next });
    },
    [value, onChange]
  );

  const removeEquivalent = useCallback(
    (markerIndex: number, eqIndex: number) => {
      const flatIdx = markerIndex + eqIndex;
      if (flatIdx >= value.answers.length) return;
      const next = value.answers.slice();
      next.splice(flatIdx, 1);
      onChange({ ...value, answers: next });
    },
    [value, onChange]
  );

  return (
    <div className="space-y-m">
      {/* === Question editor + insert cloze button === */}
      <div className="space-y-1">
        <Label htmlFor="frontContent" className="sr-only">
          题目（含挖空）
        </Label>
        <MarkdownEditor
          ref={editorRef}
          value={question}
          onChange={onQuestionChange}
          placeholder="问题（Markdown，可使用 {{c1::提示}} 或 {{#1}} 挖空）..."
          ariaLabel="题目编辑器"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            提示：在光标处插入 {"{{cN::}}"} 挖空（也支持手写 {"{{#N}}"}）
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInsertCloze}
            aria-label="插入挖空"
            className="shrink-0"
          >
            <Brackets className="mr-1 h-4 w-4" aria-hidden />
            插入挖空
          </Button>
        </div>
      </div>

      {/* === Per-cloze answer groups ============================== */}
      {clozes.length === 0 ? (
        <LegacyAnswers
          value={value}
          onChange={onChange}
          fieldErrors={fieldErrors}
        />
      ) : (
        <div className="space-y-m">
          <Label>各空答案（按题目中的 {"{{cN::}}"} 顺序）</Label>
          {clozes.map((c) => (
            <ClozeAnswerGroup
              key={c.markerIndex}
              position={c.position}
              markerIndex={c.markerIndex}
              hint={c.hint}
              // Primary for cloze N is at answers[N-1] — matches the
              // renderer. Previously used c.position which broke for
              // non-sequential cN (c1/c3/c5) and for {{#N}} with
              // arbitrary N.
              primary={value.answers[c.markerIndex - 1] ?? ""}
              equivalentes={equivalentesFor(value.answers, clozes, c.position)}
              onPrimaryChange={(v) => setClozeAnswer(c.markerIndex, v)}
              onAddEquivalent={() => addEquivalent(c.position)}
              onSetEquivalent={(i, v) => setEquivalentValue(c.markerIndex, i, v)}
              onRemoveEquivalent={(i) => removeEquivalent(c.markerIndex, i)}
            />
          ))}
          {fieldErrors?.answers ? (
            <p className="text-xs text-destructive" role="alert">
              {fieldErrors.answers}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Legacy "all answers in a flat list" UI for cards that have plain
 * `____` underscores (no Anki-style clozes). The flat list stays
 * as the storage shape — this just renders the same shape the
 * prior form used.
 */
function LegacyAnswers({
  value,
  onChange,
  fieldErrors,
}: Pick<FillFormProps, "value" | "onChange" | "fieldErrors">) {
  return (
    <div className="space-y-m">
      <Label>可接受答案 (≥ {MIN_ANSWERS})</Label>
      {value.answers.map((ans, i) => (
        <OptionRow
          key={i}
          index={i}
          value={ans}
          onValueChange={(v) => {
            const next = value.answers.slice();
            next[i] = v;
            onChange({ ...value, answers: next });
          }}
          onRemove={() => {
            const next = value.answers.filter((_, j) => j !== i);
            onChange({ ...value, answers: next });
          }}
          canRemove={value.answers.length > MIN_ANSWERS}
          placeholder={`等价答案 ${i + 1}`}
          ariaLabel={`等价答案 ${i + 1}`}
          removeAriaLabel={`删除答案 ${i + 1}`}
          control={<span className="w-4 shrink-0" aria-hidden />}
        />
      ))}
      {fieldErrors?.answers ? (
        <p className="text-xs text-destructive" role="alert">
          {fieldErrors.answers}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...value, answers: [...value.answers, ""] })}
      >
        + 添加等价答案
      </Button>
    </div>
  );
}

/**
 * Renders one cloze's answer group: the primary input + a flat
 * list of equivalent inputs. The "第 N 空" header shows the
 * inline hint from the question text when present, so the user
 * can double-check they typed the answer for the right cloze.
 */
function ClozeAnswerGroup({
  markerIndex,
  hint,
  primary,
  equivalentes,
  onPrimaryChange,
  onAddEquivalent,
  onSetEquivalent,
  onRemoveEquivalent,
}: {
  position: number;
  markerIndex: number;
  hint: string;
  primary: string;
  equivalentes: string[];
  onPrimaryChange: (v: string) => void;
  onAddEquivalent: () => void;
  onSetEquivalent: (index: number, v: string) => void;
  onRemoveEquivalent: (index: number) => void;
}) {
  return (
    <div className="space-y-xxs rounded-xl border border-border bg-card/30 p-m">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand">
          第 {markerIndex} 空
          {hint ? (
            <span className="ml-2 text-muted-foreground">· 提示：{hint}</span>
          ) : null}
        </p>
        <span className="font-mono text-[10px] text-muted-foreground">
          主答案 + {equivalentes.length} 个等价
        </span>
      </div>
      <Input
        value={primary}
        onChange={(e) => onPrimaryChange(e.target.value)}
        placeholder={`第 ${markerIndex} 空答案`}
        aria-label={`第 ${markerIndex} 空答案`}
        className="glass-input"
      />
      {equivalentes.map((eq, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={eq}
            onChange={(e) => onSetEquivalent(i, e.target.value)}
            placeholder={`等价答案 ${i + 1}`}
            aria-label={`第 ${markerIndex} 空等价答案 ${i + 1}`}
            className="glass-input flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`删除第 ${markerIndex} 空等价答案 ${i + 1}`}
            onClick={() => onRemoveEquivalent(i)}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAddEquivalent}
        className="text-muted-foreground"
      >
        <Plus className="mr-1 h-3 w-3" aria-hidden />
        添加等价答案
      </Button>
    </div>
  );
}

export const FillForm = memo(FillFormImpl);
