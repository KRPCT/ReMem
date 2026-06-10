/**
 * Pure-function library for markdown -> typed-card batch parsing.
 * No React, no DB, no fetch - unit-testable in isolation.
 *
 * Format contract (locked by RESEARCH.md Claude's Discretion):
 *   - Card delimiter:     standalone === line  (distinct from front/back separator)
 *   - Front/back sep:     first standalone --- line inside a card segment
 *   - choice/multi opts:  - [ ] / - [x] task-list lines; [x] = correct
 *   - fill cloze:         {{c1::hint}} / {{#N}} (verbatim from card-body.tsx)
 *   - judge verdict:      答案: 正确/错误/对/错/true/false line in front or back
 */
import { cardCreateSchema, type CardCreateInput, type CardType } from "@/lib/validation";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Per-row parse error. `row` is 1-based (for the preview UI). */
export type ParseRowError = { row: number; message: string };

/** Maximum cards accepted in a single batch (DoS guard T-12-02). */
export const MAX_IMPORT_CARDS = 200;

// ─── Cloze regexes — copied VERBATIM from card-body.tsx lines 355-356 ────────
// Do NOT hand-roll alternatives: drift from the renderer is a correctness bug.
const CLOZE_PATTERN_C = /\{\{c(\d+)::([^}]*?)\}\}/g;
const CLOZE_PATTERN_HASH = /\{\{#(\d+)\}\}/g;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Identical two-pass logic to findClozeBlanks in card-body.tsx (lines 365-398).
 * Returns blanks sorted by source position, each with a 1-based `index` and
 * the hint string (empty string for the {{#N}} form).
 */
function findClozeBlanks(
  source: string
): Array<{ start: number; end: number; index: number; hint: string }> {
  const out: Array<{ start: number; end: number; index: number; hint: string }> = [];

  // Pass 1: Anki-style {{cN::hint}}
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

  // Pass 2: short {{#N}} form. Skip positions already covered by cN::.
  CLOZE_PATTERN_HASH.lastIndex = 0;
  while ((m = CLOZE_PATTERN_HASH.exec(source)) !== null) {
    const idx = Number(m[1]);
    const start = m.index;
    const end = m.index + m[0].length;
    const overlaps = out.some((c) => !(end <= c.start || start >= c.end));
    if (overlaps) continue;
    out.push({ start, end, index: idx, hint: "" });
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Build the fill answers array from frontContent.
 * answers[N-1] = hint for cloze blank N (0-padded so every index exists).
 * Returns null if no cloze markers found, with a legacy flag if ____ present.
 */
function extractFillAnswers(
  frontContent: string
): { answers: string[]; legacy: boolean } | null {
  const blanks = findClozeBlanks(frontContent);

  if (blanks.length === 0) {
    const hasLegacy = /_{4,}/.test(frontContent);
    return hasLegacy ? { answers: [""], legacy: true } : null;
  }

  const answers: string[] = [];
  for (const blank of blanks) {
    const idx = blank.index - 1; // 0-based
    while (answers.length <= idx) answers.push("");
    // Only overwrite if not already set (cN form wins over #N form on same index)
    if (answers[idx] === "") {
      answers[idx] = blank.hint;
    }
  }
  return { answers, legacy: false };
}

/**
 * Parse task-list option lines from a block of text.
 *
 * Correctness is taken from the `[x]` checkbox OR a trailing ✓ / √ marker on
 * the option text. The marker is the copy-robust fallback: when choice cards
 * are copied through a markdown renderer the `[x]` checkbox is downgraded to
 * `[ ]` (the `x` is lost), but a plain ✓ in the option text survives — so a
 * `- [x] 答案 ✓` option still parses as correct even after that corruption.
 */
function parseOptionLines(text: string): Array<{ text: string; checked: boolean }> {
  const lines = text.split("\n");
  const opts: Array<{ text: string; checked: boolean }> = [];
  for (const line of lines) {
    const m = /^\s*-\s*\[( |x|X)\]\s*(.*)$/.exec(line);
    if (!m) continue;
    let optText = (m[2] ?? "").trim();
    let checked = m[1] !== " ";
    if (/[✓√]$/.test(optText)) {
      checked = true;
      optText = optText.replace(/\s*[✓√]+$/, "").trim();
    }
    opts.push({ text: optText, checked });
  }
  return opts;
}

/** Extract the text BEFORE the first option line in a block. */
function frontTextBeforeOptions(text: string): string {
  const lines = text.split("\n");
  const firstOptIdx = lines.findIndex((l) => /^\s*-\s*\[[ xX]\]/.test(l));
  if (firstOptIdx <= 0) return "";
  return lines.slice(0, firstOptIdx).join("\n").trim();
}

/** Remove the 答案: line from a text block and return both. */
function extractJudgeLine(
  text: string
): { clean: string; correct: boolean | null } {
  const judgeRe = /^\s*答案[:：]\s*(正确|错误|对|错|true|false)\s*$/m;
  const m = judgeRe.exec(text);
  if (!m) return { clean: text.trim(), correct: null };
  const verdict = m[1];
  const correct = verdict === "正确" || verdict === "对" || verdict === "true";
  const clean = text.replace(judgeRe, "").trim();
  return { clean, correct };
}

/** Parse letter-labeled options like `A. 选项` / `B、选项` / `C) 选项`. */
function parseLetterOptions(text: string): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z])\s*[.、)）.]\s*(.+)$/.exec(line);
    if (m) out.push({ label: m[1]!.toUpperCase(), text: m[2]!.trim() });
  }
  return out;
}

/** The raw value after a `答案:` line (e.g. "A", "A、C", "正确"), or null. */
function extractAnswerValue(text: string): string | null {
  const m = /^\s*答案[:：]\s*(.+?)\s*$/m.exec(text);
  return m ? m[1]!.trim() : null;
}

/**
 * Read an optional boolean flag line like `乱序: 否` / `置底: 是`. Returns null
 * when absent so the caller can apply the default (keeps the template clean —
 * most cards declare nothing). Accepts 是/否, true/false, yes/no, 开/关.
 */
function extractFlag(text: string, label: string): boolean | null {
  const re = new RegExp(
    `^\\s*${label}[:：]\\s*(是|否|true|false|yes|no|开|关|on|off)\\s*$`,
    "im"
  );
  const m = re.exec(text);
  if (!m) return null;
  return ["是", "true", "yes", "开", "on"].includes(m[1]!.toLowerCase());
}

/** Remove any `答案: ...` line from a block. */
function stripAnswerLine(text: string): string {
  return text.replace(/^\s*答案[:：].*$/m, "").trim();
}

/** Text before the first letter-labeled option line. */
function textBeforeLetterOptions(text: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^\s*[A-Za-z]\s*[.、)）.]\s/.test(l));
  if (i <= 0) return "";
  return lines.slice(0, i).join("\n").trim();
}

/**
 * Resolve options + 0-based correct indices for a choice/multi card. Prefers the
 * copy-robust letter format (`A. 选项` lines + a separate `答案: A` line — plain
 * text that survives any renderer round-trip); falls back to the legacy
 * `- [x]` / `✓` checkbox format. Returns null when no options are found.
 */
function parseChoiceOptions(
  front: string,
  back: string
): { options: string[]; correct: number[]; frontContent: string } | null {
  const letterOpts = parseLetterOptions(front);
  if (letterOpts.length >= 2) {
    const ansVal = extractAnswerValue(front) ?? extractAnswerValue(back);
    const letters = ansVal
      ? (ansVal.toUpperCase().match(/[A-Z]/g) ?? []).filter((L) =>
          letterOpts.some((o) => o.label === L)
        )
      : [];
    const correct = [...new Set(letters)]
      .map((L) => letterOpts.findIndex((o) => o.label === L))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    return {
      options: letterOpts.map((o) => o.text),
      correct,
      frontContent: textBeforeLetterOptions(front),
    };
  }
  const opts = parseOptionLines(front);
  if (opts.length === 0) return null;
  const correct = [
    ...new Set(opts.map((o, i) => (o.checked ? i : -1)).filter((i) => i >= 0)),
  ].sort((a, b) => a - b);
  return {
    options: opts.map((o) => o.text),
    correct,
    frontContent: frontTextBeforeOptions(front),
  };
}

/**
 * Infer a card's type from its structure, for the "auto" (mixed) batch mode.
 * Precedence: cloze -> options -> judge line -> qa. Mirrors the markers each
 * dedicated parser looks for, so a well-formed card of any type round-trips to
 * the same type the user would have picked manually.
 */
function detectCardType(front: string, back: string): CardType {
  if (findClozeBlanks(front).length > 0) return "fill";
  // Letter format: `A. 选项` lines (+ a `答案: A` line). >=2 letter options is a
  // strong signal — commit to choice/multi even when the 答案 line is missing or
  // unmatched, so a malformed choice errors clearly ("缺少正确答案") instead of
  // silently importing as a qa card.
  const letterOpts = parseLetterOptions(front);
  if (letterOpts.length >= 2) {
    const ansVal = extractAnswerValue(front) ?? extractAnswerValue(back);
    const letters = ansVal
      ? (ansVal.toUpperCase().match(/[A-Z]/g) ?? []).filter((L) =>
          letterOpts.some((o) => o.label === L)
        )
      : [];
    return new Set(letters).size >= 2 ? "multi_choice" : "choice";
  }
  // Legacy checkbox format: - [x] / - [ ] / ✓.
  const opts = parseOptionLines(front);
  if (opts.length > 0) {
    const checked = opts.filter((o) => o.checked).length;
    return checked >= 2 ? "multi_choice" : "choice";
  }
  if (
    extractJudgeLine(front).correct !== null ||
    extractJudgeLine(back).correct !== null
  ) {
    return "judge";
  }
  return "qa";
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Parse a multi-card markdown text into typed card objects.
 *
 * @param text     - Raw markdown text from user paste. Cards are separated by
 *                   standalone `===` lines; front/back by the first standalone
 *                   `---` line inside each card segment.
 * @param cardType - The card type for every card in this batch, OR "auto" to
 *                   detect each card's type from its structure (mixed batch).
 * @param deckId   - The target deck ID, embedded in each card object so the
 *                   caller can pass the results directly to cardCreateSchema.
 *
 * @returns `{ cards, errors }` - cards are validated CardCreateInput objects;
 *          errors carry a 1-based row index + Zod / parser message.
 */
export function parseCardBatch(
  text: string,
  cardType: CardType | "auto",
  deckId: string
): { cards: CardCreateInput[]; errors: ParseRowError[] } {
  const cards: CardCreateInput[] = [];
  const errors: ParseRowError[] = [];

  // Normalize CRLF / lone CR to LF FIRST. JS `.` and `$` do not treat a
  // trailing `\r` as a line end, so on Windows files every `(.+)$` option /
  // answer match fails and choice cards silently misdetect as qa. (#crlf)
  const src = text.replace(/\r\n?/g, "\n");

  // Step 1: Split into card segments on standalone === (3+ equals signs).
  const segments = src
    .split(/^={3,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  // Step 2: Batch size cap (T-12-02).
  if (segments.length > MAX_IMPORT_CARDS) {
    errors.push({
      row: 0,
      message: `一次最多导入 ${MAX_IMPORT_CARDS} 张卡片，当前共 ${segments.length} 张`,
    });
    return { cards, errors };
  }

  // Step 3: Parse each segment (1-based row index for user-facing messages).
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const row = i + 1;

    // Split on first standalone --- line.
    const sepMatch = /^-{3,}\s*$/m.exec(seg);
    let front: string;
    let back: string;
    if (sepMatch && sepMatch.index !== undefined) {
      front = seg.slice(0, sepMatch.index).trim();
      back = seg.slice(sepMatch.index + sepMatch[0].length).trim();
    } else {
      front = seg.trim();
      back = "";
    }

    // Dispatch on card type (auto-detected per card when cardType === "auto").
    const effectiveType: CardType =
      cardType === "auto" ? detectCardType(front, back) : cardType;
    try {
      switch (effectiveType) {
        case "qa": {
          if (!front) {
            errors.push({ row, message: "卡片正面不能为空" });
            continue;
          }
          const result = cardCreateSchema.safeParse({
            deckId,
            frontContent: front,
            backContent: back,
            typeData: { type: "qa" },
            fields: {},
          });
          if (!result.success) {
            errors.push({ row, message: result.error.issues[0]?.message ?? "解析失败" });
          } else {
            cards.push(result.data);
          }
          break;
        }

        case "choice": {
          const parsed = parseChoiceOptions(front, back);
          if (!parsed || parsed.options.length === 0) {
            errors.push({ row, message: "选择题至少需要 2 个选项" });
            continue;
          }
          if (parsed.correct.length === 0) {
            errors.push({
              row,
              message: "选择题缺少正确答案（加一行 答案: A 指定正确选项）",
            });
            continue;
          }
          const result = cardCreateSchema.safeParse({
            deckId,
            frontContent: parsed.frontContent || front,
            backContent: stripAnswerLine(back),
            typeData: {
              type: "choice",
              options: parsed.options,
              answer: parsed.correct[0]!,
              shuffle: extractFlag(front, "乱序") ?? true,
              pinLastOption: extractFlag(front, "置底") ?? false,
            },
            fields: {},
          });
          if (!result.success) {
            errors.push({ row, message: result.error.issues[0]?.message ?? "解析失败" });
          } else {
            cards.push(result.data);
          }
          break;
        }

        case "multi_choice": {
          const parsed = parseChoiceOptions(front, back);
          if (!parsed || parsed.options.length === 0) {
            errors.push({ row, message: "多选题至少需要 2 个选项" });
            continue;
          }
          if (parsed.correct.length === 0) {
            errors.push({
              row,
              message: "多选题缺少正确答案（加一行 答案: A、C 指定正确选项）",
            });
            continue;
          }
          const result = cardCreateSchema.safeParse({
            deckId,
            frontContent: parsed.frontContent || front,
            backContent: stripAnswerLine(back),
            typeData: {
              type: "multi_choice",
              options: parsed.options,
              answers: parsed.correct,
              shuffle: extractFlag(front, "乱序") ?? true,
              pinLastOption: extractFlag(front, "置底") ?? false,
            },
            fields: {},
          });
          if (!result.success) {
            errors.push({ row, message: result.error.issues[0]?.message ?? "解析失败" });
          } else {
            cards.push(result.data);
          }
          break;
        }

        case "fill": {
          const extracted = extractFillAnswers(front);
          if (extracted === null) {
            errors.push({ row, message: "填空卡至少需要一个挖空 ({{c1::答案}} 或 {{#1}})" });
            continue;
          }
          if (extracted.legacy) {
            // Legacy ____ detected: emit the card (answers: [""]) AND a warning error.
            const result = cardCreateSchema.safeParse({
              deckId,
              frontContent: front,
              backContent: back,
              typeData: { type: "fill", answers: [""] },
              fields: {},
            });
            // Push error to flag as incomplete.
            errors.push({
              row,
              message: "填空卡缺少答案，请用 {{c1::答案}} 标注",
            });
            // Still emit the card if schema passes (caller decides on preview).
            if (result.success) {
              cards.push(result.data);
            }
            continue;
          }
          const result = cardCreateSchema.safeParse({
            deckId,
            frontContent: front,
            backContent: back,
            typeData: { type: "fill", answers: extracted.answers },
            fields: {},
          });
          if (!result.success) {
            errors.push({ row, message: result.error.issues[0]?.message ?? "解析失败" });
          } else {
            cards.push(result.data);
          }
          break;
        }

        case "judge": {
          // Check both front and back for 答案: line (RESEARCH.md A3).
          const fromFront = extractJudgeLine(front);
          const cleanFront = fromFront.clean;
          let cleanBack = back;
          let correct: boolean | null = fromFront.correct;

          if (correct === null) {
            const fromBack = extractJudgeLine(back);
            cleanBack = fromBack.clean;
            correct = fromBack.correct;
          }

          if (correct === null) {
            errors.push({ row, message: "判断卡缺少 答案: 正确/错误 行" });
            continue;
          }

          if (!cleanFront) {
            errors.push({ row, message: "卡片正面不能为空" });
            continue;
          }

          const result = cardCreateSchema.safeParse({
            deckId,
            frontContent: cleanFront,
            backContent: cleanBack,
            typeData: { type: "judge", correct },
            fields: {},
          });
          if (!result.success) {
            errors.push({ row, message: result.error.issues[0]?.message ?? "解析失败" });
          } else {
            cards.push(result.data);
          }
          break;
        }

        default: {
          errors.push({ row, message: `未知卡片类型: ${effectiveType}` });
        }
      }
    } catch (err) {
      errors.push({
        row,
        message: err instanceof Error ? err.message : "解析失败",
      });
    }
  }

  return { cards, errors };
}
