/**
 * Table-driven vitest suite for parseCardBatch.
 * Pure function tests — no jsdom, no DB, no React.
 */
import { describe, it, expect } from "vitest";
import { cardCreateSchema } from "@/lib/validation";
import { parseCardBatch, MAX_IMPORT_CARDS } from "./card-import";

// ─── qa ──────────────────────────────────────────────────────────────────────

describe("qa parsing", () => {
  const cases = [
    {
      name: "front/back split on ---",
      input: "What is the capital of France?\n---\nParis",
      expectCards: 1,
      expectErrors: 0,
      partial: { frontContent: "What is the capital of France?", backContent: "Paris" },
    },
    {
      name: "no --- means whole text is front, back is empty",
      input: "No separator here",
      expectCards: 1,
      expectErrors: 0,
      partial: { frontContent: "No separator here", backContent: "" },
    },
    {
      name: "multi-paragraph front",
      input: "Line 1\nLine 2\n---\nAnswer here",
      expectCards: 1,
      expectErrors: 0,
      partial: { frontContent: "Line 1\nLine 2", backContent: "Answer here" },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const { cards, errors } = parseCardBatch(c.input, "qa", "deck-1");
      expect(cards).toHaveLength(c.expectCards);
      expect(errors).toHaveLength(c.expectErrors);
      if (c.expectCards > 0 && c.partial) {
        expect(cards[0]).toMatchObject(c.partial);
      }
    });
  }

  it("empty front => one row error", () => {
    const { cards, errors } = parseCardBatch("---\nonly back", "qa", "deck-1");
    expect(cards).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("Zod conformance: emitted qa card passes cardCreateSchema", () => {
    const { cards } = parseCardBatch("Q\n---\nA", "qa", "deck-1");
    expect(cards).toHaveLength(1);
    const result = cardCreateSchema.safeParse(cards[0]);
    expect(result.success).toBe(true);
  });
});

// ─── choice ──────────────────────────────────────────────────────────────────

describe("choice parsing", () => {
  const basic = [
    "Which planet is closest to the Sun?",
    "- [ ] Earth",
    "- [x] Mercury",
    "- [ ] Venus",
    "- [ ] Mars",
    "---",
    "Mercury is the innermost planet.",
  ].join("\n");

  it("4 options with one [x] => options.length===4, answer===0-based index", () => {
    const { cards, errors } = parseCardBatch(basic, "choice", "deck-1");
    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    const td = cards[0]?.typeData as { type: "choice"; options: string[]; answer: number };
    expect(td.options).toHaveLength(4);
    expect(td.answer).toBe(1); // Mercury is index 1 (0-based)
  });

  it("text before first option is frontContent", () => {
    const { cards } = parseCardBatch(basic, "choice", "deck-1");
    expect(cards[0]?.frontContent).toBe("Which planet is closest to the Sun?");
  });

  it("text after --- is backContent", () => {
    const { cards } = parseCardBatch(basic, "choice", "deck-1");
    expect(cards[0]?.backContent).toBe("Mercury is the innermost planet.");
  });

  it("third option checked => answer===2 (proves 0-based, guards Pitfall 2)", () => {
    const input = [
      "Color of the sky:",
      "- [ ] Red",
      "- [ ] Green",
      "- [x] Blue",
      "- [ ] Purple",
    ].join("\n");
    const { cards, errors } = parseCardBatch(input, "choice", "deck-1");
    expect(errors).toHaveLength(0);
    const td = cards[0]?.typeData as { type: "choice"; answer: number };
    expect(td.answer).toBe(2);
  });

  it("zero [x] lines => row error (no correct answer)", () => {
    const input = [
      "Question?",
      "- [ ] A",
      "- [ ] B",
    ].join("\n");
    const { cards, errors } = parseCardBatch(input, "choice", "deck-1");
    expect(cards).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("defaults: shuffle===true, pinLastOption===false", () => {
    const { cards } = parseCardBatch(basic, "choice", "deck-1");
    const td = cards[0]?.typeData as { shuffle: boolean; pinLastOption: boolean };
    expect(td.shuffle).toBe(true);
    expect(td.pinLastOption).toBe(false);
  });

  it("Zod conformance: emitted choice card passes cardCreateSchema", () => {
    const { cards } = parseCardBatch(basic, "choice", "deck-1");
    expect(cards).toHaveLength(1);
    const result = cardCreateSchema.safeParse(cards[0]);
    expect(result.success).toBe(true);
  });
});

// ─── multi_choice ─────────────────────────────────────────────────────────────

describe("multi_choice parsing", () => {
  const noble = [
    "Which are noble gases?",
    "- [x] Helium",
    "- [ ] Nitrogen",
    "- [x] Neon",
    "- [x] Argon",
    "---",
    "He, Ne, Ar are group 18.",
  ].join("\n");

  it("3 of 4 checked => answers===[0,2,3] (0-based, every [x])", () => {
    const { cards, errors } = parseCardBatch(noble, "multi_choice", "deck-1");
    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    const td = cards[0]?.typeData as { type: "multi_choice"; answers: number[] };
    expect(td.answers).toEqual([0, 2, 3]);
  });

  it("normal 2-checked card produces no duplicate-answers error (dedup guard)", () => {
    const input = [
      "Pick two:",
      "- [x] A",
      "- [ ] B",
      "- [x] C",
    ].join("\n");
    const { cards, errors } = parseCardBatch(input, "multi_choice", "deck-1");
    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    // Confirm no Zod rejection with "重复答案"
    const r = cardCreateSchema.safeParse(cards[0]);
    expect(r.success).toBe(true);
  });

  it("zero [x] lines => row error", () => {
    const input = [
      "Q?",
      "- [ ] A",
      "- [ ] B",
    ].join("\n");
    const { cards, errors } = parseCardBatch(input, "multi_choice", "deck-1");
    expect(cards).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("Zod conformance: emitted multi_choice card passes cardCreateSchema", () => {
    const { cards } = parseCardBatch(noble, "multi_choice", "deck-1");
    expect(cards).toHaveLength(1);
    const result = cardCreateSchema.safeParse(cards[0]);
    expect(result.success).toBe(true);
  });
});

// ─── fill ─────────────────────────────────────────────────────────────────────

describe("fill parsing", () => {
  it("{{c1::hint}} extracts answer at answers[0]", () => {
    const input = "The speed of light is {{c1::299792458}} m/s.";
    const { cards, errors } = parseCardBatch(input, "fill", "deck-1");
    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    const td = cards[0]?.typeData as { type: "fill"; answers: string[] };
    expect(td.answers[0]).toBe("299792458");
  });

  it("{{#N}} with no hint: parsed position exists; card may fail schema if answer empty", () => {
    // {{#2}} has no hint => answers[1] would be "". cardCreateSchema.fill.answers
    // requires min(1) per element, so an empty-string answer fails validation.
    // The parser surfaces this as a row error (Zod rejection), not a silent omission.
    const input = "Freezes at {{c1::0}} and boils at {{#2}} degrees.";
    const { cards, errors } = parseCardBatch(input, "fill", "deck-1");
    // Either the card is emitted (if the parser strips the empty slot) or an error
    // surfaces (Zod "答案不能为空"). Both are acceptable — what's NOT acceptable is
    // silently emitting a card with an empty answer slot that passes Zod.
    if (cards.length > 0) {
      // If a card was emitted, every answer in the array must be non-empty
      const td = cards[0]?.typeData as { type: "fill"; answers: string[] };
      expect(td.answers.every((a) => a.length > 0)).toBe(true);
      // And the card must pass schema
      expect(cardCreateSchema.safeParse(cards[0]).success).toBe(true);
    } else {
      // Error path is also valid: Zod rejected because {{#2}} had no hint
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it("{{c1::A}} only => card is valid", () => {
    // Sanity check for the single-cloze case (answers.length===1)
    const input = "Freezes at {{c1::0}} degrees.";
    const { cards, errors } = parseCardBatch(input, "fill", "deck-1");
    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    const td = cards[0]?.typeData as { type: "fill"; answers: string[] };
    expect(td.answers).toHaveLength(1);
    expect(td.answers[0]).toBe("0");
  });

  it("legacy ____ only => row flagged incomplete (error or warning), NOT silently valid with real answer", () => {
    const input = "Fill in: ____ is the capital.";
    const { cards, errors } = parseCardBatch(input, "fill", "deck-1");
    // Either: no cards (error path) or cards with errors flagging incomplete
    // The contract: the row MUST NOT silently produce a card with a non-empty extracted answer
    if (cards.length > 0) {
      // If a card was emitted (incomplete warning path), there must be an accompanying error
      expect(errors.length).toBeGreaterThan(0);
      const td = cards[0]?.typeData as { type: "fill"; answers: string[] };
      // answers[0] must be "" — not a fabricated non-empty answer
      expect(td.answers[0]).toBe("");
    } else {
      // Error path: no card emitted
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it("no cloze and no ____ => row error", () => {
    const input = "No blanks here at all.";
    const { cards, errors } = parseCardBatch(input, "fill", "deck-1");
    expect(cards).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("Zod conformance: emitted fill card passes cardCreateSchema", () => {
    const input = "Answer: {{c1::42}}.";
    const { cards } = parseCardBatch(input, "fill", "deck-1");
    expect(cards).toHaveLength(1);
    const result = cardCreateSchema.safeParse(cards[0]);
    expect(result.success).toBe(true);
  });
});

// ─── judge ────────────────────────────────────────────────────────────────────

describe("judge parsing", () => {
  it("答案: 正确 => typeData.correct===true", () => {
    const input = "The Earth orbits the Sun.\n答案: 正确";
    const { cards, errors } = parseCardBatch(input, "judge", "deck-1");
    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    const td = cards[0]?.typeData as { type: "judge"; correct: boolean };
    expect(td.correct).toBe(true);
  });

  it("答案: 错误 => typeData.correct===false", () => {
    const input = "The Great Wall is visible from space.\n答案: 错误";
    const { cards, errors } = parseCardBatch(input, "judge", "deck-1");
    expect(errors).toHaveLength(0);
    const td = cards[0]?.typeData as { type: "judge"; correct: boolean };
    expect(td.correct).toBe(false);
  });

  it("答案 line in back section also works", () => {
    const input = "Statement.\n---\n答案: 对";
    const { cards, errors } = parseCardBatch(input, "judge", "deck-1");
    expect(errors).toHaveLength(0);
    const td = cards[0]?.typeData as { type: "judge"; correct: boolean };
    expect(td.correct).toBe(true);
  });

  it("missing 答案 line => row error whose message matches /答案/", () => {
    const input = "No answer line here.";
    const { cards, errors } = parseCardBatch(input, "judge", "deck-1");
    expect(cards).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/答案/);
  });

  it("Zod conformance: emitted judge card passes cardCreateSchema", () => {
    const input = "Water boils at 100C at sea level.\n答案: 正确";
    const { cards } = parseCardBatch(input, "judge", "deck-1");
    expect(cards).toHaveLength(1);
    const result = cardCreateSchema.safeParse(cards[0]);
    expect(result.success).toBe(true);
  });
});

// ─── batch / boundary ────────────────────────────────────────────────────────

describe("batch and boundary", () => {
  it("3 cards separated by === => cards.length===3, errors.length===0", () => {
    const input = [
      "Q1\n---\nA1",
      "===",
      "Q2\n---\nA2",
      "===",
      "Q3\n---\nA3",
    ].join("\n");
    const { cards, errors } = parseCardBatch(input, "qa", "deck-1");
    expect(cards).toHaveLength(3);
    expect(errors).toHaveLength(0);
  });

  it("=== with surrounding blank lines still splits correctly", () => {
    const input = "Q1\n---\nA1\n\n===\n\nQ2\n---\nA2";
    const { cards, errors } = parseCardBatch(input, "qa", "deck-1");
    expect(cards).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });

  it(`a ${MAX_IMPORT_CARDS + 1}-card blob => single batch-level error mentioning the cap; no cards emitted`, () => {
    const segments = Array.from({ length: MAX_IMPORT_CARDS + 1 }, (_, i) => `Q${i}\n---\nA${i}`);
    const input = segments.join("\n===\n");
    const { cards, errors } = parseCardBatch(input, "qa", "deck-1");
    expect(cards).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.row).toBe(0);
    // message should mention cap
    expect(errors[0]?.message).toMatch(/200/);
  });

  it("mixed valid + invalid rows: valid card emitted, invalid row is an error", () => {
    // card 1: valid qa
    // card 2: empty front => error
    const input = "Good question\n---\nAnswer\n===\n---\nonly back";
    const { cards, errors } = parseCardBatch(input, "qa", "deck-1");
    expect(cards).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.row).toBe(2); // 1-based: second card
  });

  it("row errors have 1-based row index", () => {
    // Single card batch, first card is invalid
    const input = "---\nonly back";
    const { errors } = parseCardBatch(input, "qa", "deck-1");
    expect(errors[0]?.row).toBe(1); // first row is row 1
  });

  it("MAX_IMPORT_CARDS constant is 200", () => {
    expect(MAX_IMPORT_CARDS).toBe(200);
  });
});

// ─── auto (mixed-type) detection ───────────────────────────────────────────────

describe("auto detection", () => {
  const cases: Array<{ name: string; input: string; type: string }> = [
    { name: "qa: plain front/back", input: "首都是哪？\n---\n北京", type: "qa" },
    {
      name: "choice: single [x]",
      input: "选一个\n- [ ] A\n- [x] B\n- [ ] C",
      type: "choice",
    },
    {
      name: "multi_choice: 2+ [x]",
      input: "选多个\n- [x] A\n- [ ] B\n- [x] C",
      type: "multi_choice",
    },
    { name: "fill: cloze marker", input: "化学式是 {{c1::H2O}}。", type: "fill" },
    {
      name: "judge: answer line in front",
      input: "地球是平的。\n答案: 错误",
      type: "judge",
    },
    {
      name: "judge: answer line in back",
      input: "HTTP 无状态。\n---\n答案: true",
      type: "judge",
    },
  ];

  for (const c of cases) {
    it(`detects ${c.name}`, () => {
      const { cards, errors } = parseCardBatch(c.input, "auto", "deck-1");
      expect(errors).toEqual([]);
      expect(cards).toHaveLength(1);
      expect(cards[0]?.typeData.type).toBe(c.type);
    });
  }

  it("parses a mixed batch of all 5 types in one paste", () => {
    const mixed = [
      "纯问答题\n---\n答案",
      "单选\n- [x] 对\n- [ ] 错",
      "多选\n- [x] A\n- [x] B\n- [ ] C",
      "填空 {{c1::答案}}",
      "判断句。\n答案: 正确",
    ].join("\n\n===\n\n");
    const { cards, errors } = parseCardBatch(mixed, "auto", "deck-1");
    expect(errors).toEqual([]);
    expect(cards.map((c) => c.typeData.type)).toEqual([
      "qa",
      "choice",
      "multi_choice",
      "fill",
      "judge",
    ]);
  });
});

// ─── copy-robust ✓ marker ──────────────────────────────────────────────────────

describe("trailing ✓ correct-answer marker", () => {
  it("treats `- [x] 答案 ✓` as correct and strips the marker from the option", () => {
    const { cards, errors } = parseCardBatch(
      "选一个\n- [x] 对 ✓\n- [ ] 错",
      "choice",
      "d"
    );
    expect(errors).toEqual([]);
    expect(cards[0]?.typeData).toMatchObject({ answer: 0, options: ["对", "错"] });
  });

  it("recovers the answer when [x] was downgraded to [ ] but ✓ survives", () => {
    const corrupted = "选一个\n- [ ] 对 ✓\n- [ ] 错"; // [x] -> [ ], ✓ remains
    const { cards, errors } = parseCardBatch(corrupted, "auto", "d");
    expect(errors).toEqual([]);
    expect(cards[0]?.typeData.type).toBe("choice");
    expect(cards[0]?.typeData).toMatchObject({ answer: 0 });
  });

  it("recovers multi-choice answers from ✓ after [x] corruption", () => {
    const corrupted = "多选\n- [ ] A ✓\n- [ ] B\n- [ ] C ✓";
    const { cards, errors } = parseCardBatch(corrupted, "auto", "d");
    expect(errors).toEqual([]);
    expect(cards[0]?.typeData.type).toBe("multi_choice");
    expect(cards[0]?.typeData).toMatchObject({ answers: [0, 2] });
  });
});

// ─── letter-labeled options + separate 答案 line ───────────────────────────────

describe("letter format (A. 选项 + 答案: A)", () => {
  it("auto-detects single-answer choice and maps the letter", () => {
    const src = "下列哪个是质数？\nA. 2\nB. 4\nC. 6\n答案: A";
    const { cards, errors } = parseCardBatch(src, "auto", "d");
    expect(errors).toEqual([]);
    expect(cards[0]?.typeData).toMatchObject({
      type: "choice",
      answer: 0,
      options: ["2", "4", "6"],
    });
    expect(cards[0]?.frontContent).toBe("下列哪个是质数？");
  });

  it("auto-detects multi from multiple answer letters (答案: A、C)", () => {
    const src = "下列哪些是质数？\nA. 2\nB. 4\nC. 5\n答案: A、C";
    const { cards, errors } = parseCardBatch(src, "auto", "d");
    expect(errors).toEqual([]);
    expect(cards[0]?.typeData).toMatchObject({
      type: "multi_choice",
      answers: [0, 2],
    });
  });

  it("survives full markdown corruption (no bullets/checkboxes to lose)", () => {
    // The letter labels + 答案 line are plain text; nothing for a renderer to mangle.
    const src = "选一个\nA. 对\nB. 错\n答案: A\n---\n解释";
    const { cards, errors } = parseCardBatch(src, "choice", "d");
    expect(errors).toEqual([]);
    expect(cards[0]?.typeData).toMatchObject({ answer: 0, options: ["对", "错"] });
    expect(cards[0]?.backContent).toBe("解释");
  });

  it("does not misread a judge card (答案: 正确) as choice", () => {
    const src = "地球是圆的。\n答案: 正确";
    const { cards } = parseCardBatch(src, "auto", "d");
    expect(cards[0]?.typeData.type).toBe("judge");
  });
});

// ─── CRLF line endings (Windows files) ─────────────────────────────────────────

describe("CRLF normalization", () => {
  it("letter choice with \\r\\n detects as choice (not qa)", () => {
    const src = "下列哪个是质数？\r\nA. 2\r\nB. 4\r\nC. 6\r\n答案: A";
    const { cards, errors } = parseCardBatch(src, "auto", "d");
    expect(errors).toEqual([]);
    expect(cards[0]?.typeData).toMatchObject({
      type: "choice",
      answer: 0,
      options: ["2", "4", "6"],
    });
  });

  it("checkbox + fill + judge all survive \\r\\n", () => {
    const src =
      "选一个\r\n- [ ] A\r\n- [x] B\r\n===\r\n水是 {{c1::H2O}}\r\n===\r\n地球是圆的。\r\n答案: 正确";
    const { cards, errors } = parseCardBatch(src, "auto", "d");
    expect(errors).toEqual([]);
    expect(cards.map((c) => c.typeData.type)).toEqual([
      "choice",
      "fill",
      "judge",
    ]);
  });
});
