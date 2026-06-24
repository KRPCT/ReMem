"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Eye, EyeOff, Shuffle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cardTypeDataSchema,
  type CardType,
  type CardTypeData,
} from "@/lib/validation";
import { CardTypeBadge } from "./card-type-badge";
import { MarkdownRendererLazy } from "@/components/markdown/markdown-renderer-lazy";
import { renderOptionPlaceholders } from "@/lib/render-option-placeholders";

/**
 * Type-aware card body renderer.
 *
 * Each of the 5 card types renders differently inside the modal:
 *
 *   - **qa**: question text. On reveal, the back content shows below.
 *   - **choice**: question + A/B/C/D options. On reveal, the correct
 *     option is highlighted; wrong options fade.
 *   - **multi_choice**: same as choice, but multiple options get the
 *     "correct" highlight.
 *   - **judge**: question + 正确/错误 buttons. On reveal, the correct
 *     one is highlighted.
 *   - **fill**: question text with the first `____` sequence
 *     (4+ underscores) replaced by a styled blank. On reveal, the
 *     blank is filled in with the first acceptable answer.
 *
 * The component supports two reveal modes:
 *
 *   - **Modal/static** (default, `interactive={false}`): the parent
 *     owns the `showAnswer` state. Options render as static rows.
 *   - **Study/interactive** (`interactive={true}`): the user can click
 *     an option to "judge" themselves; the body locks their pick,
 *     highlights the correct answer(s), and surfaces a `correct` /
 *     `wrong` verdict via the `onJudged` callback.
 *
 * Shuffle: when `typeData.shuffle === true`, options are reordered
 * client-side via Fisher-Yates. The shuffle is computed once per
 * (cardId, options length) and can be re-rolled via the "重新洗牌"
 * button. `pinLastOption` keeps the last option at the bottom.
 *
 * Why client-side: the server stores the correct option by its
 * ORIGINAL index (`data.answer` / `data.answers`); shuffling on the
 * server would require also rewriting those index fields, which is
 * stateful and could leak between the create form and the study
 * view. Client-side keeps the schema stable.
 */

export interface CardBodyProps {
  type: string;
  frontContent: string | null;
  backContent: string | null;
  typeData: unknown;
  showAnswer: boolean;
  /** Stable key for memoizing the shuffle (one card = one shuffle). */
  cardId?: string;
  /**
   * When true, options render as clickable buttons for self-judging.
   * Modal usage leaves this false (default) to preserve the prior
   * static rendering.
   */
  interactive?: boolean;
  /**
   * Fired when the user picks an option in interactive mode. The
   * `userPicks` are the original option indices (1-based positions
   * are not used here — callers index into `typeData` directly).
   */
  onJudged?: (result: {
    correct: boolean;
    cardId: string;
    userPicks: number[];
  }) => void;
  /**
   * Monotonic counter from the parent (study session). Incremented
   * on every advance OR on every "Again" re-show, so the body's
   * internal `judgment` / `multiPicks` state is wiped even when
   * the SAME card re-appears (which doesn't change `cardId`).
   * Without this, the same card was re-shown with the previous
   * verdict still locked and the multi-choice options disabled.
   */
  revealKey?: number;
  /**
   * B2 `autoRevealCloze`. When true (default = current behavior),
   * revealing the card fills in every cloze blank at once. When false,
   * each blank stays masked after reveal until individually tapped —
   * per-blank active recall. Only the study session threads this; the
   * browse modal leaves it at the default.
   */
  autoRevealCloze?: boolean;
}

/**
 * Safe parse: malformed typeData (older schema, hand-edited row)
 * falls back to a `qa` body so the modal still renders instead of
 * crashing the whole route.
 */
function parseTypeData(raw: unknown): CardTypeData {
  const parsed = cardTypeDataSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { type: "qa" };
}

const LETTER = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

/**
 * A choice/multi_choice option in DISPLAY order that carries its own
 * `sourceIndex` (its position in the author's original `data.options`).
 *
 * This is the heart of the click-bug fix: every consumer compares
 * `sourceIndex` (invariant under shuffle), never a display position. The
 * button the user clicks, the answer it's judged against, and the
 * highlight it receives are all keyed off this one number — so they can
 * never disagree, regardless of how the options were shuffled.
 */
type DisplayOption = { sourceIndex: number; text: string };

/** Stable empty set so render props don't allocate a new Set each pass. */
const EMPTY_SOURCE_SET: ReadonlySet<number> = new Set<number>();

/**
 * Deterministic 32-bit string hash (FNV-1a). Same input → same seed,
 * so a given `cardId` produces the SAME shuffle on the server and the
 * client. This is what keeps the option order SSR-stable.
 */
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32 — a tiny seeded PRNG. Deterministic floats in [0, 1)
 * from a 32-bit seed. Replaces `Math.random` in the shuffle so the
 * permutation is a PURE function of (cardId, reshuffle seed).
 *
 * Why this matters: `CardBody` is server-rendered (it's a client
 * component mounted under a server component) and then hydrated.
 * `Math.random()` during render produced a DIFFERENT option order on
 * the server vs. the client → a "Recoverable Error: Hydration failed"
 * and, worse, the button the user clicked no longer matched the option
 * the click handler judged ("单选点击选项和实际判定选项不一致"). A
 * deterministic seed makes both renders agree, so click == judge.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates over an array of original option indices, driven by a
 * caller-supplied seeded `rng` (NOT `Math.random` — see `mulberry32`).
 * When `pinLast` is true, the last index is moved to the end after
 * shuffling the prefix — so the pinned option always renders last.
 *
 * The correctness of the answer does not depend on the order; the
 * order is purely presentational, but it MUST be identical on server
 * and client, which the seeded rng guarantees.
 */
function shuffleIndices(
  count: number,
  pinLast: boolean,
  rng: () => number
): number[] {
  const out = Array.from({ length: count }, (_, i) => i);
  if (count <= 1) return out;
  // Fisher-Yates on the whole array.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (pinLast) {
    // Move the last-original-index back to the end.
    const lastIdx = count - 1;
    const cur = out.indexOf(lastIdx);
    if (cur >= 0 && cur !== out.length - 1) {
      const [picked] = out.splice(cur, 1);
      out.push(picked);
    }
  }
  return out;
}

function Question({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border border-border/40 bg-card/40 p-4"
      aria-label="题目"
    >
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        题目
      </p>
      {/* String content (qa/judge) renders Markdown so $KaTeX$, code blocks and
          mermaid work; JSX content (choice/fill) keeps literal whitespace. */}
      {typeof children === "string" ? (
        <div className="text-sm leading-relaxed">
          <MarkdownRendererLazy content={children} />
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {children}
        </div>
      )}
    </section>
  );
}

function AnswerPanel({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"
      aria-label="答案"
    >
      <p className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
        <CheckCircle className="h-3 w-3" aria-hidden />
        答案
      </p>
      {typeof children === "string" ? (
        <div className="text-sm leading-relaxed">
          <MarkdownRendererLazy content={children} />
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {children}
        </div>
      )}
    </section>
  );
}

function OptionList({
  options,
  correctSources,
  faded,
}: {
  options: DisplayOption[];
  correctSources: ReadonlySet<number>;
  faded: boolean;
}) {
  return (
    <ul className="space-y-1.5">
      {options.map((opt, i) => {
        const isCorrect = correctSources.has(opt.sourceIndex);
        return (
          <li
            key={opt.sourceIndex}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              isCorrect
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-border/40 bg-card/30",
              faded && !isCorrect && "opacity-50"
            )}
          >
            <span
              className={cn(
                "font-mono text-xs",
                isCorrect
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              )}
            >
              {LETTER[i] ?? i + 1}.
            </span>
            <span className="flex-1">{opt.text}</span>
            {isCorrect ? (
              <CheckCircle
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                aria-label="正确答案"
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Judge body: two big buttons (正确 / 错误). `revealed` and
 * `picked` are the two display flags:
 *
 *   - When `revealed === false` and not picked, both buttons look neutral.
 *   - When `picked` is set, the user's pick is shown locked.
 *   - When `revealed === true`, the correct one is highlighted.
 *
 * In interactive mode, the buttons are clickable and call
 * `onPick(0|1)`. In static mode they're rendered as disabled.
 */
function JudgeButtons({
  correct,
  revealed,
  picked,
  interactive,
  onPick,
}: {
  correct: boolean;
  revealed: boolean;
  picked: 0 | 1 | null;
  interactive: boolean;
  onPick?: (picked: 0 | 1) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!interactive}
        onClick={interactive ? () => onPick?.(0) : undefined}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium",
          revealed && correct
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : picked === 0
              ? "border-brand/50 bg-brand/10 text-brand"
              : "border-border/40 bg-card/30 text-muted-foreground",
          interactive && !picked && !revealed
            ? "hover:border-brand/40 hover:text-brand"
            : "opacity-60"
        )}
        aria-label="正确"
        aria-pressed={picked === 0}
      >
        <CheckCircle className="h-4 w-4" aria-hidden />
        正确
      </button>
      <button
        type="button"
        disabled={!interactive}
        onClick={interactive ? () => onPick?.(1) : undefined}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium",
          revealed && !correct
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : picked === 1
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border/40 bg-card/30 text-muted-foreground",
          interactive && !picked && !revealed
            ? "hover:border-destructive/40 hover:text-destructive"
            : "opacity-60"
        )}
        aria-label="错误"
        aria-pressed={picked === 1}
      >
        <XCircle className="h-4 w-4" aria-hidden />
        错误
      </button>
    </div>
  );
}

/**
 * Cloze-blank patterns (TWO equivalent syntaxes, both supported):
 *
 *   - Anki-style: `{{c1::hint text}}` / `{{c2::answer}}`.
 *     The N after `c` is the 1-based blank index. The text after
 *     `::` is the optional "hint" — used as a fallback display
 *     label when no matching `typeData.answers[N-1]` is set.
 *
 *   - Index-only: `{{#1}}` / `{{#2}}`. Shortcut for the common
 *     case where no hint is needed. The 1-based number maps
 *     directly to `typeData.answers[N-1]`.
 *
 * Both forms are rendered identically on the page. A question may
 * freely mix the two syntaxes (e.g. `The capital of {{c1::France}}
 * is {{#2}}` — c1 and #2 resolve to the same `answers` array).
 */
const CLOZE_PATTERN_C = /\{\{c(\d+)::([^}]*?)\}\}/g;
const CLOZE_PATTERN_HASH = /\{\{#(\d+)\}\}/g;

/**
 * Parse cloze markers from the source. Returns the markers in the
 * order they appear in the text, each tagged with the 1-based
 * blank number and (for the `cN::` form) the optional hint.
 *
 * The hint for `{{#N}}` is the empty string.
 */
function findClozeBlanks(
  source: string
): Array<{ start: number; end: number; index: number; hint: string }> {
  const out: Array<{ start: number; end: number; index: number; hint: string }> = [];

  // Pass 1: Anki-style `{{cN::hint}}` — strict superset (range + hint)
  CLOZE_PATTERN_C.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLOZE_PATTERN_C.exec(source)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      index: Number(m[1]),
      hint: m[2] ?? "",
    });
  }
  // Pass 2: short `{{#N}}` form. Skips positions already covered
  // by a `cN::` form so the cN form wins on overlap.
  CLOZE_PATTERN_HASH.lastIndex = 0;
  while ((m = CLOZE_PATTERN_HASH.exec(source)) !== null) {
    const idx = Number(m[1]);
    const start = m.index;
    const end = m.index + m[0].length;
    const overlaps = out.some(
      (c) => !(end <= c.start || start >= c.end)
    );
    if (overlaps) continue;
    out.push({ start, end, index: idx, hint: "" });
  }

  // Re-sort by start position so render order matches source order.
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Render a fill-blank body for the given source. Supports BOTH:
 *
 *   1. Anki-style cloze: `{{c1::hint}}`, `{{c2::hint}}`, ...
 *      - Before reveal: each cloze renders as a styled `____` blank.
 *      - After reveal: each cloze renders the answer from
 *        `typeData.answers[N-1]`, falling back to the inline hint
 *        when no matching answer is set.
 *
 *   2. Legacy underscore: `____` (4+ underscores).
 *      - Replaces the FIRST underscore run with a single blank.
 *      - On reveal, the blank shows `typeData.answers[0]` (or `____`).
 *
 * When neither pattern is present, the source is returned unchanged.
 *
 * Note: this intentionally does NOT route through the Markdown
 * renderer — cloze markers are first-class surface syntax, not
 * Markdown, and the user-supplied `frontContent` may or may not be
 * Markdown. We render the surrounding text via Markdown and inject
 * the blanks as React nodes.
 */
function renderFillQuestion(
  source: string,
  typeData: { answers: string[] },
  revealed: boolean,
  opts?: {
    /** false = per-blank tap-to-reveal (B2 autoRevealCloze). Default true. */
    autoReveal?: boolean;
    revealedBlanks?: ReadonlySet<number>;
    onRevealBlank?: (index: number) => void;
  }
): React.ReactNode {
  const cloze = findClozeBlanks(source);
  const autoReveal = opts?.autoReveal ?? true;

  // Path 1: Anki-style cloze markers
  if (cloze.length > 0) {
    const segments: React.ReactNode[] = [];
    let cursor = 0;
    cloze.forEach((c, i) => {
      // Text between previous cursor and this cloze start, rendered
      // as Markdown (with key=i to keep React happy across edits).
      const before = source.slice(cursor, c.start);
      if (before) {
        segments.push(<MarkdownInline key={`m-${i}`} content={before} />);
      }
      const answer = typeData.answers[c.index - 1];
      // In auto-reveal mode the blank fills the moment the card is
      // revealed. In manual mode it only fills once this specific blank
      // has been tapped (per-blank active recall).
      const blankShown = autoReveal
        ? revealed
        : (opts?.revealedBlanks?.has(c.index) ?? false);

      if (!blankShown && !autoReveal && revealed) {
        // Card revealed but this blank still masked: render a tappable
        // chip so the user can check one blank at a time.
        segments.push(
          <button
            key={`b-${i}`}
            type="button"
            onClick={() => opts?.onRevealBlank?.(c.index)}
            className="mx-1 inline-block min-w-[3ch] rounded-md border border-dashed border-brand/60 bg-brand/10 px-2 py-0.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-brand transition-colors hover:bg-brand/20"
            aria-label={`显示第 ${c.index} 空答案`}
          >
            点击显示
          </button>
        );
        cursor = c.end;
        return;
      }

      const display = blankShown ? answer ?? c.hint ?? "____" : "____";
      segments.push(
        <span
          key={`b-${i}`}
          className="mx-1 inline-block min-w-[3ch] rounded-md border border-dashed border-brand/60 bg-brand/10 px-2 py-0.5 text-center font-mono text-xs text-brand"
          aria-label={`第 ${c.index} 空`}
        >
          {display}
        </span>
      );
      cursor = c.end;
    });
    // Trailing text after the last cloze.
    const tail = source.slice(cursor);
    if (tail) {
      segments.push(<MarkdownInline key="m-tail" content={tail} />);
    }
    return <>{segments}</>;
  }

  // Path 2: legacy 4+ underscore fallback (preserves prior card form).
  const match = source.match(/_{4,}/);
  if (!match) return <MarkdownInline content={source} />;
  const idx = match.index ?? 0;
  const before = source.slice(0, idx);
  const after = source.slice(idx + match[0].length);
  const blank = (
    <span
      className="mx-1 inline-block min-w-[3ch] rounded-md border border-dashed border-brand/60 bg-brand/10 px-2 py-0.5 text-center font-mono text-xs uppercase tracking-[0.18em] text-brand"
      aria-label="填空"
    >
      {revealed ? typeData.answers[0] ?? "____" : "____"}
    </span>
  );
  return (
    <>
      {before}
      {blank}
      {after}
    </>
  );
}

/**
 * Tiny inline-Markdown wrapper for fill-blank context. Reuses the
 * project's MarkdownRenderer but without the wrapping prose classes
 * (the parent Question block already provides those).
 */
function MarkdownInline({ content }: { content: string }) {
  // Render inline so the inter-cloze text flows on the same line as the blanks
  // (the default block <p> from MarkdownRenderer forces line breaks — the cause
  // of the "weird line breaks" around fill blanks). $KaTeX$ still renders.
  return (
    <MarkdownRendererLazy
      content={content}
      className="inline [&_p]:m-0 [&_p]:inline"
    />
  );
}

/**
 * Re-shuffle button. Shown on choice / multi_choice bodies when the
 * `shuffle` flag is true and the user has not yet judged (so the
 * re-shuffle doesn't change the lock state).
 */
function ReshuffleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-card/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
      aria-label="重新洗牌"
    >
      <Shuffle className="h-3 w-3" aria-hidden />
      重新洗牌
    </button>
  );
}

/**
 * Inline verdict message. `correctOriginalIndices` is the set of
 * original option indices that are correct; we surface a "第 N 项"
 * hint in 1-based display order (so the user sees the position
 * they would have picked on screen).
 */
function Verdict({
  verdict,
  correctDisplayPositions,
}: {
  verdict: "correct" | "wrong";
  correctDisplayPositions: number[];
}) {
  const isCorrect = verdict === "correct";
  return (
    <p
      className={cn(
        "rounded-md px-3 py-1.5 text-sm",
        isCorrect
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border border-destructive/30 bg-destructive/10 text-destructive"
      )}
      role="status"
      aria-live="polite"
    >
      {isCorrect ? (
        "答对了"
      ) : (
        <>
          答错了 · 正确：
          {correctDisplayPositions
            .map((p) => `第 ${p} 项`)
            .join("、")}
        </>
      )}
    </p>
  );
}

export function CardBody({
  type,
  frontContent,
  backContent,
  typeData,
  showAnswer,
  cardId,
  interactive = false,
  onJudged,
  revealKey = 0,
  autoRevealCloze = true,
}: CardBodyProps) {
  const front = frontContent ?? "";
  const back = backContent ?? "";
  const data = parseTypeData(typeData);
  // Guard: if the card's `type` field is somehow inconsistent with
  // typeData, trust typeData (the discriminated union is the source
  // of truth for what fields exist).
  const effectiveType: CardType = (data.type as CardType) ?? (type as CardType);

  // Interactive-mode judgment state. `null` = not yet judged.
  //
  // The judgment tracks the SOURCE indices the user picked — the same
  // identity space the options are rendered and judged in. There is no
  // display-position field to keep in sync, so the "clicked button ≠
  // judged/highlighted option" bug class is structurally impossible:
  // a button is "picked" iff its `sourceIndex` is in `pickedSources`.
  const [judgment, setJudgment] = useState<{
    correct: boolean;
    /** SOURCE indices the user picked — invariant across shuffle. */
    pickedSources: number[];
  } | null>(null);
  // Multi-choice: a local "picks" buffer that lives BEFORE
  // judgment. The user toggles options freely, then clicks a
  // dedicated "提交答案" button to commit. This is the
  // user-requested "选完再判断" flow — auto-judging on every
  // toggle is wrong for multi-choice (the user might be mid-pick
  // when an accidental click counts as a wrong answer).
  const [multiPicks, setMultiPicks] = useState<number[]>([]);
  // B2 autoRevealCloze=false: the set of 1-based cloze blank indices the
  // user has individually tapped to reveal. Reset on every card change.
  const [revealedBlanks, setRevealedBlanks] = useState<ReadonlySet<number>>(
    () => new Set<number>()
  );

  // Reset judgment whenever the card identity changes (e.g. user
  // advances to the next card in the study session). The key is the
  // `cardId` when provided, else the content fingerprint.
  useEffect(() => {
    setJudgment(null);
    setMultiPicks([]);
    setRevealedBlanks(new Set<number>());
  }, [cardId, frontContent, backContent, revealKey]);

  const revealBlank = useCallback((index: number) => {
    setRevealedBlanks((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  // === Shuffle (choice / multi_choice) =============================
  const shouldShuffle =
    (data.type === "choice" || data.type === "multi_choice") && data.shuffle;
  const pinLast =
    (data.type === "choice" || data.type === "multi_choice") &&
    data.pinLastOption;
  const optionsCount =
    data.type === "choice" || data.type === "multi_choice"
      ? data.options.length
      : 0;

  // `seed` is bumped by the re-shuffle button to force a fresh order.
  const [seed, setSeed] = useState(0);

  // The display ORDER as a list of source indices. PURE seeded shuffle
  // (mulberry32, not Math.random) keyed on cardId + reshuffle counter,
  // so the server and the client compute the identical order — no SSR
  // hydration mismatch. This is the ONLY place order is decided; every
  // consumer below works in source-index space, so the displayed order
  // can never desync from what gets judged.
  const order = useMemo<number[]>(() => {
    if (optionsCount === 0) return [];
    if (!shouldShuffle) {
      return Array.from({ length: optionsCount }, (_, i) => i);
    }
    const seedBase =
      (hashSeed(cardId ?? frontContent ?? "card") ^
        Math.imul(seed + 1, 0x9e3779b9)) >>>
      0;
    return shuffleIndices(optionsCount, pinLast, mulberry32(seedBase));
  }, [cardId, frontContent, optionsCount, shouldShuffle, pinLast, seed]);

  // Resolve a source index to its current display LETTER (A/B/C…) for
  // `{{#N}}` placeholders in the question / option / back text — the
  // letter the user actually sees on that option. Returns `undefined`
  // (not throw / "") for an out-of-range index so the helper leaves the
  // placeholder literal, surfacing a broken author reference.
  const sourceIndexToLabel = useCallback(
    (sourceIndex: number): string | undefined => {
      const pos = order.indexOf(sourceIndex);
      if (pos < 0) return undefined;
      return LETTER[pos] ?? String(pos + 1);
    },
    [order]
  );

  // The display list: each entry carries its OWN source index, plus its
  // text with `{{#N}}` placeholders resolved. Consumers render this and
  // pass `opt.sourceIndex` straight back on click — no position→source
  // map to get wrong.
  const displayOptions = useMemo<DisplayOption[]>(() => {
    if (data.type !== "choice" && data.type !== "multi_choice") return [];
    return order.map((sourceIndex) => ({
      sourceIndex,
      text: renderOptionPlaceholders(
        data.options[sourceIndex] ?? "",
        sourceIndexToLabel
      ),
    }));
  }, [data, order, sourceIndexToLabel]);

  // Correct answer(s) as a SET of source indices — each option checks
  // membership by its own `sourceIndex`.
  const correctSources = useMemo<ReadonlySet<number>>(() => {
    if (data.type === "choice" && typeof data.answer === "number") {
      return new Set<number>([data.answer]);
    }
    if (data.type === "multi_choice") {
      return new Set<number>(data.answers);
    }
    return EMPTY_SOURCE_SET;
  }, [data]);

  // The correct answers as 1-based DISPLAY positions, for the verdict's
  // "正确：第 N 项" hint (the position the user sees on screen).
  const correctDisplayPositions = useMemo(() => {
    return [...correctSources]
      .map((src) => order.indexOf(src))
      .filter((p) => p >= 0)
      .map((p) => p + 1)
      .sort((a, b) => a - b);
  }, [correctSources, order]);

  const onReshuffle = useCallback(() => {
    setSeed((n) => n + 1);
  }, []);

  // === Interactive judgment handlers ==============================
  const isLocked = judgment !== null;

  // Pull the answer(s) into stable locals so the callbacks can
  // re-narrow `data` without TypeScript losing the discrimination
  // across the closure boundary.
  const choiceAnswer = data.type === "choice" ? data.answer : -1;
  const multiAnswerSet = useMemo(() => {
    return data.type === "multi_choice" ? new Set(data.answers) : null;
  }, [data]);
  const judgeCorrect = data.type === "judge" ? data.correct : false;

  const handleChoiceClick = useCallback(
    (sourceIndex: number) => {
      if (!interactive || isLocked) return;
      // `sourceIndex` is read straight off the clicked option, so the
      // correctness check and the highlight both refer to exactly what
      // the user clicked — no display↔source remapping to get wrong.
      const correct = sourceIndex === choiceAnswer;
      setJudgment({ correct, pickedSources: [sourceIndex] });
      if (onJudged && cardId) {
        onJudged({ correct, cardId, userPicks: [sourceIndex] });
      }
    },
    [interactive, isLocked, choiceAnswer, onJudged, cardId]
  );

  const handleMultiChoiceToggle = useCallback(
    (sourceIndex: number) => {
      if (!interactive || isLocked) return;
      // Toggle the source index in the local picks buffer; nothing is
      // committed until "提交答案" — avoids the old "auto-judge on every
      // toggle" bug where a mid-pick click counted as a wrong answer.
      setMultiPicks((prev) =>
        prev.includes(sourceIndex)
          ? prev.filter((p) => p !== sourceIndex)
          : [...prev, sourceIndex]
      );
    },
    [interactive, isLocked]
  );

  const handleMultiChoiceSubmit = useCallback(() => {
    if (!multiAnswerSet) return;
    const correct =
      multiPicks.length === multiAnswerSet.size &&
      multiPicks.every((p) => multiAnswerSet.has(p));
    setJudgment({ correct, pickedSources: multiPicks.slice() });
    if (onJudged && cardId) {
      onJudged({ correct, cardId, userPicks: multiPicks.slice() });
    }
  }, [multiAnswerSet, multiPicks, onJudged, cardId]);

  const handleJudgeClick = useCallback(
    (picked: 0 | 1) => {
      if (!interactive || isLocked) return;
      // picked=0 → 正确; picked=1 → 错误. data.correct=true means "正确
      // is the right answer", so picking 正确 is correct only when
      // data.correct is true. Judge isn't shuffled — pickedSources
      // carries the 0|1 button choice.
      const correct = (picked === 0) === judgeCorrect;
      setJudgment({ correct, pickedSources: [picked] });
      if (onJudged && cardId) {
        onJudged({ correct, cardId, userPicks: [picked] });
      }
    },
    [interactive, isLocked, judgeCorrect, onJudged, cardId]
  );

  // === Render =====================================================
  // For static (non-interactive) mode, the parent's `showAnswer` is
  // the only source of truth. For interactive mode, we synthesize
  // the visual reveal from the judgment state instead.
  const effectiveShowAnswer = interactive
    ? showAnswer || judgment !== null
    : showAnswer;
  // For interactive mode, the "correct" highlight is shown once the
  // user has judged OR once they explicitly hit "显示答案" (showAnswer).
  // Without the `|| showAnswer` clause, revealing a choice/multi/judge
  // card WITHOUT first picking left every option neutral -- the correct
  // answer never surfaced ("点击显示答案不会显示具体选项"). qa/fill
  // revealed fine because they key off effectiveShowAnswer, so the bug
  // only bit the option-based types.
  const showCorrectHighlight = interactive
    ? judgment !== null || showAnswer
    : showAnswer;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTypeBadge type={effectiveType} />
        {effectiveShowAnswer ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            <Eye className="h-3 w-3" aria-hidden />
            答案已显示
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <EyeOff className="h-3 w-3" aria-hidden />
            答案已隐藏
          </span>
        )}
      </div>

      {/* ===== QA ===== */}
      {effectiveType === "qa" ? (
        <>
          <Question>{front || "（无内容）"}</Question>
          {effectiveShowAnswer && back ? <AnswerPanel>{back}</AnswerPanel> : null}
        </>
      ) : null}

      {/* ===== CHOICE ===== */}
      {effectiveType === "choice" && data.type === "choice" ? (
        <>
          <Question>
            {renderOptionPlaceholders(front, sourceIndexToLabel) || "（无内容）"}
          </Question>
          {shouldShuffle && !isLocked ? (
            <div className="flex justify-end">
              <ReshuffleButton onClick={onReshuffle} />
            </div>
          ) : null}
          {interactive ? (
            <InteractiveOptionList
              options={displayOptions}
              correctSources={
                showCorrectHighlight ? correctSources : EMPTY_SOURCE_SET
              }
              pickedSources={
                judgment ? new Set(judgment.pickedSources) : EMPTY_SOURCE_SET
              }
              faded={showCorrectHighlight}
              onPick={handleChoiceClick}
              multi={false}
            />
          ) : (
            <OptionList
              options={displayOptions}
              correctSources={
                showCorrectHighlight ? correctSources : EMPTY_SOURCE_SET
              }
              faded={showCorrectHighlight}
            />
          )}
          {interactive && judgment ? (
            <Verdict
              verdict={judgment.correct ? "correct" : "wrong"}
              correctDisplayPositions={correctDisplayPositions}
            />
          ) : null}
          {effectiveShowAnswer && back ? (
            <AnswerPanel>
              {renderOptionPlaceholders(back, sourceIndexToLabel)}
            </AnswerPanel>
          ) : null}
        </>
      ) : null}

      {/* ===== MULTI_CHOICE ===== */}
      {effectiveType === "multi_choice" && data.type === "multi_choice" ? (
        <>
          <Question>
            {renderOptionPlaceholders(front, sourceIndexToLabel) || "（无内容）"}
          </Question>
          {shouldShuffle && !isLocked ? (
            <div className="flex justify-end">
              <ReshuffleButton onClick={onReshuffle} />
            </div>
          ) : null}
          {interactive ? (
            <InteractiveOptionList
              options={displayOptions}
              correctSources={
                showCorrectHighlight ? correctSources : EMPTY_SOURCE_SET
              }
              pickedSources={
                // After commit: the committed picks. Before: the live
                // toggle buffer. Both are SOURCE-index sets — the same
                // identity the buttons render with.
                judgment ? new Set(judgment.pickedSources) : new Set(multiPicks)
              }
              faded={showCorrectHighlight}
              onPick={handleMultiChoiceToggle}
              multi={true}
            />
          ) : (
            <OptionList
              options={displayOptions}
              correctSources={
                showCorrectHighlight ? correctSources : EMPTY_SOURCE_SET
              }
              faded={showCorrectHighlight}
            />
          )}
          {/*
            Multi-choice "提交答案" button: only shown in interactive
            mode before the user has committed. Once judgment is
            set, this button disappears and the verdict + rating
            bar take over. Disabled when the user hasn't picked
            anything yet (an empty pick set is not a real answer).
          */}
          {interactive && !judgment ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleMultiChoiceSubmit}
                disabled={multiPicks.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="提交多选答案"
              >
                提交答案
              </button>
            </div>
          ) : null}
          {interactive && judgment ? (
            <Verdict
              verdict={judgment.correct ? "correct" : "wrong"}
              correctDisplayPositions={correctDisplayPositions}
            />
          ) : null}
          {effectiveShowAnswer && back ? (
            <AnswerPanel>
              {renderOptionPlaceholders(back, sourceIndexToLabel)}
            </AnswerPanel>
          ) : null}
        </>
      ) : null}

      {/* ===== JUDGE ===== */}
      {effectiveType === "judge" && data.type === "judge" ? (
        <>
          <Question>{front || "（无内容）"}</Question>
          <JudgeButtons
            correct={data.correct}
            revealed={showCorrectHighlight}
            picked={
              judgment &&
              (judgment.pickedSources[0] === 0 ||
                judgment.pickedSources[0] === 1)
                ? (judgment.pickedSources[0] as 0 | 1)
                : null
            }
            interactive={interactive}
            onPick={handleJudgeClick}
          />
          {interactive && judgment ? (
            <Verdict
              verdict={judgment.correct ? "correct" : "wrong"}
              correctDisplayPositions={
                data.correct ? [1] /* 正确 is displayed first */ : [2 /* 错误 */]
              }
            />
          ) : null}
          {effectiveShowAnswer && back ? <AnswerPanel>{back}</AnswerPanel> : null}
        </>
      ) : null}

      {/* ===== FILL ===== */}
      {effectiveType === "fill" && data.type === "fill" ? (
        <>
          <Question>
            {renderFillQuestion(front, data, effectiveShowAnswer, {
              autoReveal: autoRevealCloze,
              revealedBlanks,
              onRevealBlank: revealBlank,
            })}
          </Question>
          {/*
            Equivalent-answers panel. Auto-reveal shows it once the card
            is revealed. In manual (per-blank) mode it stays hidden —
            surfacing every answer there would defeat the per-blank
            recall the user opted into.
          */}
          {autoRevealCloze && effectiveShowAnswer && data.answers.length > 0 ? (
            <AnswerPanel>
              <div className="flex flex-wrap gap-2">
                {data.answers.map((a, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </AnswerPanel>
          ) : null}
          {effectiveShowAnswer && back ? <AnswerPanel>{back}</AnswerPanel> : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Interactive option list. The "interactive" mode renders each
 * option as a button. On click, the parent commits the judgment
 * (handled in `handleChoiceClick` / `handleMultiChoiceToggle`
 * above). The visual state shows:
 *
 *   - The user's pick(s) with a colored border.
 *   - The correct option(s) with an emerald border + check icon.
 *   - Other (un-picked, un-correct) options faded after reveal.
 */
function InteractiveOptionList({
  options,
  correctSources,
  pickedSources,
  faded,
  onPick,
  multi,
}: {
  options: DisplayOption[];
  correctSources: ReadonlySet<number>;
  pickedSources: ReadonlySet<number>;
  faded: boolean;
  onPick: (sourceIndex: number) => void;
  multi: boolean;
}) {
  return (
    <ul className="space-y-1.5" role={multi ? "group" : "radiogroup"}>
      {options.map((opt, i) => {
        // Membership is by the option's OWN source index — the button
        // the user clicks (onPick(opt.sourceIndex)) and its picked /
        // correct highlight are the same identity, so they cannot
        // disagree no matter how the options were shuffled.
        const isCorrect = correctSources.has(opt.sourceIndex);
        const isPicked = pickedSources.has(opt.sourceIndex);
        const label = LETTER[i] ?? String(i + 1);
        return (
          <li key={opt.sourceIndex}>
            <button
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={isPicked}
              aria-label={`选项 ${label}: ${opt.text}`}
              disabled={faded}
              onClick={() => onPick(opt.sourceIndex)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                "disabled:cursor-default",
                isCorrect
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : isPicked
                    ? multi
                      ? "border-brand/50 bg-brand/10"
                      : "border-destructive/50 bg-destructive/10"
                    : "border-border/40 bg-card/30 hover:border-brand/40",
                faded && !isCorrect && !isPicked && "opacity-50"
              )}
            >
              <span
                className={cn(
                  "font-mono text-xs",
                  isCorrect
                    ? "text-emerald-600 dark:text-emerald-400"
                    : isPicked
                      ? multi
                        ? "text-brand"
                        : "text-destructive"
                      : "text-muted-foreground"
                )}
              >
                {label}.
              </span>
              <span className="flex-1">{opt.text}</span>
              {isCorrect ? (
                <CheckCircle
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-label="正确答案"
                />
              ) : isPicked ? (
                multi ? (
                  <CheckCircle
                    className="h-4 w-4 text-brand"
                    aria-label="已选"
                  />
                ) : (
                  <XCircle
                    className="h-4 w-4 text-destructive"
                    aria-label="已选（错误）"
                  />
                )
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default CardBody;
