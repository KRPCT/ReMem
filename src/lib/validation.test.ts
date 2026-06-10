import { describe, it, expect } from "vitest";
import {
  noteTypeJsonSchema,
  deckCreateSchema,
  deckUpdateSchema,
  cardTypeDataSchema,
  cardCreateSchema,
  cardUpdateSchema,
  studyPlanSchema,
} from "./validation";
import { FSRS_RECOMMENDED_VALUES } from "./fsrs/recommendations";

// Phase 08-04: studyPlanSchema grew a 6th field
// (firstSessionTargetProgress, default 0.80). The recommended-values
// fixture needs to include it so the existing "accepts FSRS
// recommended" case still passes.
const RECOMMENDED = {
  ...FSRS_RECOMMENDED_VALUES,
  firstSessionTargetProgress: 0.8,
};

const validBasic = {
  name: "Basic",
  fields: [{ name: "F", ord: 0 }],
  templates: [{ name: "T", ord: 0, qfmt: "{{F}}", afmt: "" }],
};

describe("noteTypeJsonSchema", () => {
  it("accepts a valid Basic NoteType", () => {
    expect(noteTypeJsonSchema.safeParse(validBasic).success).toBe(true);
  });

  it("rejects empty fields array", () => {
    const r = noteTypeJsonSchema.safeParse({
      name: "X",
      fields: [],
      templates: [{ name: "T", ord: 0, qfmt: "", afmt: "" }],
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues[0]?.message).toContain("至少 1 个字段");
  });

  it("rejects empty templates array", () => {
    const r = noteTypeJsonSchema.safeParse({
      name: "X",
      fields: [{ name: "F", ord: 0 }],
      templates: [],
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues[0]?.message).toContain("至少 1 个卡片模板");
  });

  it("rejects negative ord", () => {
    const r = noteTypeJsonSchema.safeParse({
      ...validBasic,
      fields: [{ name: "F", ord: -1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects name longer than 64 chars", () => {
    const r = noteTypeJsonSchema.safeParse({
      ...validBasic,
      name: "x".repeat(65),
    });
    expect(r.success).toBe(false);
  });

  it("rejects field name longer than 64 chars", () => {
    const r = noteTypeJsonSchema.safeParse({
      ...validBasic,
      fields: [{ name: "f".repeat(65), ord: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing name", () => {
    const r = noteTypeJsonSchema.safeParse({
      fields: [{ name: "F", ord: 0 }],
      templates: [{ name: "T", ord: 0, qfmt: "", afmt: "" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("deckCreateSchema", () => {
  it("accepts title + description", () => {
    expect(
      deckCreateSchema.safeParse({
        title: "Hello",
        description: "A deck",
      }).success
    ).toBe(true);
  });

  it("accepts title only (description optional)", () => {
    expect(deckCreateSchema.safeParse({ title: "Hello" }).success).toBe(true);
  });

  it("rejects empty title", () => {
    expect(deckCreateSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("rejects title longer than 120 chars", () => {
    expect(
      deckCreateSchema.safeParse({ title: "x".repeat(121) }).success
    ).toBe(false);
  });

  it("trims leading/trailing whitespace from title", () => {
    const r = deckCreateSchema.safeParse({ title: "  Padded  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe("Padded");
  });
});

describe("deckUpdateSchema", () => {
  it("requires an id field", () => {
    const r = deckUpdateSchema.safeParse({ title: "X" });
    expect(r.success).toBe(false);
  });

  it("accepts id + title", () => {
    expect(
      deckUpdateSchema.safeParse({ id: "abc123", title: "X" }).success
    ).toBe(true);
  });
});

// ─── cardTypeDataSchema (CARD-01..04) ─────────────────────────

describe("cardTypeDataSchema: choice", () => {
  it("accepts a valid choice payload", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "choice",
      options: ["A", "B"],
      answer: 0,
      shuffle: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown type literal", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "unknown",
      options: ["A"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects choice without answer (missing required)", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "choice",
      options: ["A", "B"],
      shuffle: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects choice with options length < 2", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "choice",
      options: ["only one"],
      answer: 0,
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues[0]?.message).toContain("至少 2 个选项");
  });

  it("preserves shuffle: false round-trip", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "choice",
      options: ["A", "B"],
      answer: 0,
      shuffle: false,
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "choice") {
      expect(r.data.shuffle).toBe(false);
    }
  });

  it("defaults shuffle to true when omitted", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "choice",
      options: ["A", "B"],
      answer: 0,
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "choice") {
      expect(r.data.shuffle).toBe(true);
    }
  });
});

describe("cardTypeDataSchema: multi_choice", () => {
  it("accepts a valid multi_choice payload", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "multi_choice",
      options: ["A", "B", "C"],
      answers: [0, 2],
      shuffle: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects multi_choice without answers", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "multi_choice",
      options: ["A", "B"],
      shuffle: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects multi_choice with options length < 2", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "multi_choice",
      options: ["only one"],
      answers: [0],
    });
    expect(r.success).toBe(false);
  });

  it("rejects multi_choice with empty answers (min 1)", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "multi_choice",
      options: ["A", "B"],
      answers: [],
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues[0]?.message).toContain("至少选 1 个正确答案");
  });
});

describe("cardTypeDataSchema: fill", () => {
  it("accepts a valid fill payload", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "fill",
      answers: ["北京", "首都"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects fill without answers", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "fill",
    });
    expect(r.success).toBe(false);
  });

  it("rejects fill with empty answers array (min 1)", () => {
    const r = cardTypeDataSchema.safeParse({ type: "fill", answers: [] });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues[0]?.message).toContain("至少提供 1 个等价答案");
  });
});

describe("cardTypeDataSchema: qa", () => {
  it("accepts a valid qa payload (empty typeData)", () => {
    const r = cardTypeDataSchema.safeParse({ type: "qa" });
    expect(r.success).toBe(true);
  });

  it("rejects unknown type literal", () => {
    const r = cardTypeDataSchema.safeParse({ type: "nope" });
    expect(r.success).toBe(false);
  });
});

describe("cardTypeDataSchema: judge", () => {
  it("accepts a valid judge payload (correct: true)", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "judge",
      correct: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts judge correct: false", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "judge",
      correct: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects judge without correct", () => {
    const r = cardTypeDataSchema.safeParse({ type: "judge" });
    expect(r.success).toBe(false);
  });
});

describe("cardTypeDataSchema: cross-field superRefine (CARD-04)", () => {
  it("rejects choice with answer >= options.length", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "choice",
      options: ["A", "B"],
      answer: 2,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const answerIssue = r.error.issues.find((i) => i.path[0] === "answer");
      expect(answerIssue?.message).toContain("answer 越界");
    }
  });

  it("rejects multi_choice with out-of-bounds answer index", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "multi_choice",
      options: ["A", "B"],
      answers: [0, 5],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const answerIssue = r.error.issues.find((i) => i.path[0] === "answers");
      expect(answerIssue?.message).toContain("越界");
    }
  });

  it("rejects multi_choice with duplicate answer indices", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "multi_choice",
      options: ["A", "B", "C"],
      answers: [0, 0],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const answerIssue = r.error.issues.find((i) => i.path[0] === "answers");
      expect(answerIssue?.message).toContain("重复");
    }
  });
});

describe("cardCreateSchema: round-trip", () => {
  it("parses qa + frontContent + backContent + fields", () => {
    const parsed = cardCreateSchema.parse({
      deckId: "d1",
      frontContent: "front",
      backContent: "back",
      typeData: { type: "qa" },
    });
    expect(parsed.frontContent).toBe("front");
    expect(parsed.backContent).toBe("back");
    expect(parsed.typeData.type).toBe("qa");
    // JSON round-trip
    const back = JSON.parse(JSON.stringify(parsed));
    expect(back.frontContent).toBe("front");
    expect(back.typeData.type).toBe("qa");
  });

  // 04-05 Item 4: frontContent now min(1).
  it("rejects an empty frontContent (front is required for every type)", () => {
    const r = cardCreateSchema.safeParse({
      deckId: "d1",
      frontContent: "",
      backContent: "x",
      typeData: { type: "qa" },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const frontIssue = r.error.issues.find((i) => i.path[0] === "frontContent");
      expect(frontIssue?.message).toBe("问题不能为空");
    }
  });

  it("accepts an empty backContent for non-qa types (explanation is optional)", () => {
    const r = cardCreateSchema.safeParse({
      deckId: "d1",
      frontContent: "Q",
      backContent: "",
      typeData: {
        type: "choice",
        options: ["A", "B"],
        answer: 0,
        shuffle: true,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("cardUpdateSchema: qa backContent required (04-05 Item 4)", () => {
  it("rejects qa with empty backContent on update", () => {
    const r = cardUpdateSchema.safeParse({
      id: "c1",
      deckId: "d1",
      frontContent: "Q",
      backContent: "",
      typeData: { type: "qa" },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const backIssue = r.error.issues.find((i) => i.path[0] === "backContent");
      expect(backIssue?.message).toBe("问答题的答案不能为空");
    }
  });

  it("accepts qa with non-empty backContent on update", () => {
    const r = cardUpdateSchema.safeParse({
      id: "c1",
      deckId: "d1",
      frontContent: "Q",
      backContent: "A",
      typeData: { type: "qa" },
    });
    expect(r.success).toBe(true);
  });

  it("allows empty backContent for non-qa types on update", () => {
    const r = cardUpdateSchema.safeParse({
      id: "c1",
      deckId: "d1",
      frontContent: "Q",
      backContent: "",
      typeData: { type: "fill", answers: ["foo"] },
    });
    expect(r.success).toBe(true);
  });
});

describe("deckCreateSchema / deckUpdateSchema: shuffleOptions (04-05 Item 6)", () => {
  it("accepts shuffleOptions: true", () => {
    const r = deckCreateSchema.safeParse({
      title: "Hello",
      shuffleOptions: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffleOptions).toBe(true);
  });

  it("defaults shuffleOptions to true when omitted (back-compat)", () => {
    const r = deckCreateSchema.safeParse({ title: "Hello" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffleOptions).toBe(true);
  });

  it("accepts shuffleOptions: false", () => {
    const r = deckCreateSchema.safeParse({
      title: "Hello",
      shuffleOptions: false,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffleOptions).toBe(false);
  });

  it("deckUpdateSchema requires id but accepts shuffleOptions", () => {
    const r = deckUpdateSchema.safeParse({
      id: "d1",
      title: "X",
      shuffleOptions: false,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffleOptions).toBe(false);
  });
});

// ─── 04-06 Feature A + B coverage ─────────────────────────────────────

describe("04-06 shuffleOptOut + pinLastOption", () => {
  const baseChoice = {
    deckId: "d1",
    frontContent: "q",
    typeData: {
      type: "choice" as const,
      options: ["a", "b"],
      answer: 0,
    },
  };

  it("cardCreateSchema defaults shuffleOptOut to false", () => {
    const r = cardCreateSchema.safeParse(baseChoice);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffleOptOut).toBe(false);
  });

  it("cardCreateSchema accepts shuffleOptOut: true", () => {
    const r = cardCreateSchema.safeParse({
      ...baseChoice,
      shuffleOptOut: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffleOptOut).toBe(true);
  });

  it("typeData defaults pinLastOption to false on choice", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "choice",
      options: ["a", "b"],
      answer: 0,
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "choice") {
      expect(r.data.pinLastOption).toBe(false);
    }
  });

  it("typeData accepts pinLastOption: true on multi_choice", () => {
    const r = cardTypeDataSchema.safeParse({
      type: "multi_choice",
      options: ["a", "b", "c"],
      answers: [0, 1],
      pinLastOption: true,
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "multi_choice") {
      expect(r.data.pinLastOption).toBe(true);
    }
  });

  it("cardUpdateSchema also picks up shuffleOptOut + pinLastOption", () => {
    const r = cardUpdateSchema.safeParse({
      id: "c1",
      deckId: "d1",
      frontContent: "q",
      typeData: {
        type: "choice",
        options: ["a", "b"],
        answer: 0,
        pinLastOption: true,
      },
      shuffleOptOut: true,
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.typeData.type === "choice") {
      expect(r.data.shuffleOptOut).toBe(true);
      expect(r.data.typeData.pinLastOption).toBe(true);
    }
  });
});

describe("studyPlanSchema (Phase 08-01 / 08-04)", () => {
  it("accepts the FSRS recommended values", () => {
    const r = studyPlanSchema.safeParse(RECOMMENDED);
    expect(r.success).toBe(true);
  });

  it("rejects requestRetention < 0.7", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      requestRetention: 0.65,
    });
    expect(r.success).toBe(false);
  });

  it("rejects requestRetention > 0.97", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      requestRetention: 0.98,
    });
    expect(r.success).toBe(false);
  });

  it("rejects newPerDay = -1", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      newPerDay: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects newPerDay = 10000 (max 9999)", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      newPerDay: 10000,
    });
    expect(r.success).toBe(false);
  });

  it("accepts newPerDay = 0 (paused)", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      newPerDay: 0,
    });
    expect(r.success).toBe(true);
  });

  it("rejects reviewsPerDay non-integer", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      reviewsPerDay: 1.5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing enableFuzz", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      enableFuzz: undefined,
    });
    expect(r.success).toBe(false);
  });

  it("rejects enableShortTerm as string", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      enableShortTerm: "true",
    });
    expect(r.success).toBe(false);
  });

  // ── Phase 08-04: firstSessionTargetProgress bound checks ─────
  it("rejects firstSessionTargetProgress < 0.5 (too easy)", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      firstSessionTargetProgress: 0.3,
    });
    expect(r.success).toBe(false);
  });

  it("rejects firstSessionTargetProgress > 1.0 (impossible)", () => {
    const r = studyPlanSchema.safeParse({
      ...RECOMMENDED,
      firstSessionTargetProgress: 1.1,
    });
    expect(r.success).toBe(false);
  });

  it("accepts firstSessionTargetProgress at the boundaries (0.5 and 1.0)", () => {
    for (const v of [0.5, 0.8, 1.0]) {
      const r = studyPlanSchema.safeParse({
        ...RECOMMENDED,
        firstSessionTargetProgress: v,
      });
      expect(r.success).toBe(true);
    }
  });
});
