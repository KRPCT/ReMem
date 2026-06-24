"use client";

import { useMemo, useReducer, useState, useActionState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { fileToDataUri } from "@/lib/image-data-uri";
import type {
  CardType,
  CardTypeData,
  NoteTypeField,
} from "@/lib/validation";
import { ChoiceForm } from "./choice-form";
import { MultiChoiceForm } from "./multi-choice-form";
import { FillForm } from "./fill-form";
import { JudgeForm } from "./judge-form";
import { CardTypeSegmented } from "./card-type-segmented";
import {
  createCardAction,
  updateCardAction,
  type CardActionState,
} from "../actions";

export type CardFormMode = "create" | "edit";

export interface CardFormInitial {
  id: string;
  type: CardType;
  frontContent: string;
  backContent: string;
  typeData: CardTypeData;
  fields: Record<string, string>;
  isFavorite: boolean;
  suspended: boolean;
  shuffleOptOut: boolean;
}

export interface CardFormProps {
  mode: CardFormMode;
  deckId: string;
  noteTypeFields: NoteTypeField[];
  initial?: CardFormInitial;
}

function defaultTypeDataFor(t: CardType): CardTypeData {
  switch (t) {
    case "choice":
      return {
        type: "choice",
        options: ["", ""],
        answer: 0,
        shuffle: true,
        pinLastOption: false,
      };
    case "multi_choice":
      return {
        type: "multi_choice",
        options: ["", ""],
        answers: [],
        shuffle: true,
        pinLastOption: false,
      };
    case "fill":
      return { type: "fill", answers: [""] };
    case "qa":
      return { type: "qa" };
    case "judge":
      return { type: "judge", correct: true };
  }
}

type TypeDataAction =
  | { kind: "set"; value: CardTypeData }
  | { kind: "resetType"; type: CardType };

function typeDataReducer(
  _state: CardTypeData,
  action: TypeDataAction
): CardTypeData {
  if (action.kind === "set") return action.value;
  return defaultTypeDataFor(action.type);
}

/**
 * Form-level client-side validation. Mirrors the server-side Zod
 * schema in src/lib/validation.ts (cardCreateSchema + cardTypeDataSchema).
 * Drives the submit button's `disabled` prop so a user can't create
 * a card with an empty question, missing options, or no answer.
 */
function validateCardForm(
  typeData: CardTypeData,
  frontContent: string,
  backContent: string
): boolean {
  if (!frontContent.trim()) return false;
  if (typeData.type === "qa") {
    return backContent.trim().length > 0;
  }
  if (typeData.type === "choice") {
    return (
      typeData.options.length >= 2 &&
      typeData.options.every((o) => o.trim().length > 0) &&
      typeData.answer < typeData.options.length
    );
  }
  if (typeData.type === "multi_choice") {
    return (
      typeData.options.length >= 2 &&
      typeData.options.every((o) => o.trim().length > 0) &&
      typeData.answers.length >= 1 &&
      typeData.answers.every((a) => a < typeData.options.length)
    );
  }
  if (typeData.type === "fill") {
    return (
      typeData.answers.length >= 1 &&
      typeData.answers.every((a) => a.trim().length > 0)
    );
  }
  if (typeData.type === "judge") {
    return true; // judge always has a default `correct: true`
  }
  return false;
}

export function CardForm({
  mode,
  deckId,
  noteTypeFields,
  initial,
}: CardFormProps) {
  const [typeData, dispatchTypeData] = useReducer(
    typeDataReducer,
    initial?.typeData ?? { type: "qa" }
  );
  const [frontContent, setFrontContent] = useState(
    initial?.frontContent ?? ""
  );
  const [backContent, setBackContent] = useState(
    initial?.backContent ?? ""
  );
  const [fields, setFields] = useState<Record<string, string>>(
    initial?.fields ?? {}
  );
  // isFavorite is no longer exposed in the create/edit form — toggling
  // happens on the card detail page or card list row (Item 8).
  const [suspended, setSuspended] = useState(initial?.suspended ?? false);
  // Phase 04-06 Feature A: per-card opt-out from deck-level shuffle.
  // Only meaningful for choice / multi_choice; UI is hidden otherwise
  // but state persists so the value survives type switches.
  const [shuffleOptOut, setShuffleOptOut] = useState(
    initial?.shuffleOptOut ?? false
  );

  const [state, formAction, pending] = useActionState<
    CardActionState,
    FormData
  >(mode === "create" ? createCardAction : updateCardAction, null);

  const isValid = useMemo(
    () => validateCardForm(typeData, frontContent, backContent),
    [typeData, frontContent, backContent]
  );

  return (
    <form action={formAction} className="space-y-l">
      <input type="hidden" name="deckId" value={deckId} />
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input
        type="hidden"
        name="typeData"
        value={JSON.stringify(typeData)}
      />
      <input
        type="hidden"
        name="fields"
        value={JSON.stringify(fields)}
      />
      <input
        type="hidden"
        name="isFavorite"
        value={initial?.isFavorite ? "true" : "false"}
      />
      <input
        type="hidden"
        name="suspended"
        value={suspended ? "true" : "false"}
      />
      <input
        type="hidden"
        name="shuffleOptOut"
        value={shuffleOptOut ? "true" : "false"}
      />
      <input type="hidden" name="cardType" value={typeData.type} />
      {/* MarkdownEditor content is held in React state; mirror it into
       * hidden inputs so the Server Action receives what the user typed.
       * Without these, the action's `frontContent` and `backContent`
       * FormData entries are always "" → Zod rejects with "问题不能为空". */}
      <input type="hidden" name="frontContent" value={frontContent} />
      <input type="hidden" name="backContent" value={backContent} />

      {mode === "create" ? (
        <FormSection
          eyebrow="01"
          title="题型"
          description="先选一个题型，再填具体内容。可以在此切换。"
        >
          <CardTypeSegmented
            value={typeData.type}
            onChange={(t) => dispatchTypeData({ kind: "resetType", type: t })}
            layout="inline"
          />
        </FormSection>
      ) : null}

      {/* === Sections 02 → 03 → 04 ===
       * Eyebrow flow must read 01 → 02 → 03 → 04 → 05 in linear DOM
       * order. For QA the 02/04 pair is wrapped in a side-by-side
       * grid on md+ (no 03 / shuffleOptOut for QA). For non-QA the
       * sections render as a vertical stack with the type-specific
       * config and shuffle-opt-out between 02 and 04. */}
      {typeData.type === "qa" ? (
        <div className="grid grid-cols-1 gap-l md:grid-cols-2">
          <FormSection
            eyebrow="02"
            title="题目"
            description="正面（问题）。支持 Markdown 语法 - 列表、代码块、KaTeX 公式、Mermaid 图都直接生效。"
          >
            <div className="space-y-1">
              <Label htmlFor="frontContent" className="sr-only">
                正面（问题）
              </Label>
              <MarkdownEditor
                value={frontContent}
                onChange={setFrontContent}
                placeholder="问题（Markdown）..."
                ariaLabel="问题编辑器"
                onImageUpload={fileToDataUri}
              />
            </div>
          </FormSection>

          <FormSection
            eyebrow="04"
            title="答案"
            description="背面（答案）。问答题的答案独立于题目显示。"
          >
            <div className="space-y-1">
              <Label htmlFor="backContent" className="sr-only">
                背面（答案）
              </Label>
              <MarkdownEditor
                key={typeData.type}
                value={backContent}
                onChange={setBackContent}
                placeholder="答案（Markdown）..."
                ariaLabel="答案编辑器"
                onImageUpload={fileToDataUri}
              />
            </div>
          </FormSection>
        </div>
      ) : (
        <>
          <FormSection
            eyebrow="02"
            title="题目"
            description="正面（问题）。支持 Markdown 语法 - 列表、代码块、KaTeX 公式、Mermaid 图都直接生效。"
          >
            <div className="space-y-1">
              <Label htmlFor="frontContent" className="sr-only">
                正面（问题）
              </Label>
              <MarkdownEditor
                value={frontContent}
                onChange={setFrontContent}
                placeholder="问题（Markdown）..."
                ariaLabel="问题编辑器"
                onImageUpload={fileToDataUri}
              />
            </div>
          </FormSection>

          <FormSection
            eyebrow="03"
            title="类型特定配置"
            description={
              typeData.type === "choice"
                ? "单选 - 选项 ≥ 2，标记一个正确答案。"
                : typeData.type === "multi_choice"
                  ? "多选 - 选项 ≥ 2，至少 1 个正确答案。"
                  : typeData.type === "fill"
                    ? "填空 - 提供至少 1 个可接受的等价答案。"
                    : "判断 - 选择正确答案（对 / 错）。"
            }
          >
            {typeData.type === "choice" ? (
              <ChoiceForm
                value={typeData}
                onChange={(v) => dispatchTypeData({ kind: "set", value: v })}
                fieldErrors={state?.fieldErrors}
              />
            ) : null}
            {typeData.type === "multi_choice" ? (
              <MultiChoiceForm
                value={typeData}
                onChange={(v) => dispatchTypeData({ kind: "set", value: v })}
                fieldErrors={state?.fieldErrors}
              />
            ) : null}
            {typeData.type === "fill" ? (
              <FillForm
                value={typeData}
                onChange={(v) => dispatchTypeData({ kind: "set", value: v })}
                fieldErrors={state?.fieldErrors}
                question={frontContent}
                onQuestionChange={setFrontContent}
              />
            ) : null}
            {typeData.type === "judge" ? (
              <JudgeForm
                value={typeData}
                onChange={(v) => dispatchTypeData({ kind: "set", value: v })}
                fieldErrors={state?.fieldErrors}
              />
            ) : null}
          </FormSection>

          {typeData.type === "choice" || typeData.type === "multi_choice" ? (
            <div className="rounded-xl border border-border bg-card/40 p-m">
              <label
                htmlFor="shuffleOptOut"
                className="flex cursor-pointer items-start gap-m text-sm"
              >
                <input
                  id="shuffleOptOut"
                  type="checkbox"
                  checked={shuffleOptOut}
                  onChange={(e) => setShuffleOptOut(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-medium text-foreground">
                    <span>即使牌组开启乱序,这张卡片也不乱序</span>
                    <HelpCircle
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    勾选后,即使牌组设置了乱序选项,本张卡片也会保持原始顺序。
                    适用于答案有固定位置含义 (例如 &quot;A 对应 1&quot;) 的题。
                  </p>
                </div>
              </label>
            </div>
          ) : null}

          <FormSection
            eyebrow="04"
            title="解析（可选）"
            description="背面（解析 / 解释）。点击展开填写。"
          >
            <details
              className="rounded-xl border border-border bg-card/30 p-m"
              open={backContent.trim().length > 0}
            >
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                添加解析 (可选)
              </summary>
              <div className="mt-m space-y-1">
                <Label htmlFor="backContent" className="sr-only">
                  背面（解析）
                </Label>
                <MarkdownEditor
                  value={backContent}
                  onChange={setBackContent}
                  placeholder="解析 / 解释（Markdown，可选）..."
                  ariaLabel="解析编辑器"
                  onImageUpload={fileToDataUri}
                />
              </div>
            </details>
          </FormSection>
        </>
      )}

      {noteTypeFields.length > 0 ? (
        <FormSection
          eyebrow="05"
          title="笔记"
          description="NoteType 字段值会在 Phase 6/7 的学习引擎里渲染到模板占位符。"
        >
          <details
            className="rounded-xl border border-border bg-card/30 p-m"
            open={Object.values(fields).some((v) => v.length > 0)}
          >
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              NoteType 字段值 ({noteTypeFields.length})
            </summary>
            <div className="mt-m space-y-m">
              {noteTypeFields.map((f) => (
                <div key={f.id} className="space-y-1">
                  <Label htmlFor={`field-${f.id}`}>{f.name}</Label>
                  <Input
                    id={`field-${f.id}`}
                    value={fields[f.name] ?? ""}
                    onChange={(e) =>
                      setFields((prev) => ({
                        ...prev,
                        [f.name]: e.target.value,
                      }))
                    }
                    className="glass-input"
                  />
                </div>
              ))}
            </div>
          </details>
        </FormSection>
      ) : null}

      {state?.fieldErrors && Object.keys(state.fieldErrors).length > 0 ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-m"
          role="alert"
          aria-live="polite"
        >
          <p className="mb-xs text-sm font-medium text-destructive">
            提交失败：
          </p>
          <ul className="space-y-xxs text-sm text-destructive">
            {Object.entries(state.fieldErrors).map(([path, msg]) => (
              <li key={path}>
                <span className="font-mono text-xs opacity-80">{path}</span>
                <span className="ml-1">{msg}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state?.error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label
          htmlFor="suspended"
          className="flex h-11 cursor-pointer items-center gap-m rounded-xl border border-transparent bg-card/40 px-m text-sm transition-colors hover:border-border"
        >
          <input
            id="suspended"
            type="checkbox"
            checked={suspended}
            onChange={(e) => setSuspended(e.target.checked)}
            className="h-4 w-4 rounded-sm"
          />
          暂停（不进入学习队列）
        </label>
        <Button
          type="submit"
          size="lg"
          className="min-h-toolbar"
          disabled={pending || !isValid}
        >
          {pending
            ? mode === "create"
              ? "创建中…"
              : "保存中…"
            : mode === "create"
              ? "创建卡片"
              : "保存修改"}
        </Button>
      </div>
    </form>
  );
}

// ─── Section primitives ─────────────────────────────────────────────────

function FormSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-m p-l">
        <div className="space-y-1">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2
            className="font-display text-xl font-semibold leading-snug tracking-tight"
          >
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
