import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email().toLowerCase().trim(), // D-06
  password: z.string().min(8).max(72), // bcrypt input limit
});

export const signUpSchema = signInSchema;

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

// ─── NoteType JSON shape (D-02: 1:1 with NoteType / Field / CardTemplate) ──

const fieldSchema = z.object({
  name: z.string().min(1, "字段名不能为空").max(64),
  ord: z.number().int().nonnegative(),
});

const cardTemplateSchema = z.object({
  name: z.string().min(1, "卡片模板名不能为空").max(64),
  ord: z.number().int().nonnegative(),
  qfmt: z.string(),
  afmt: z.string(),
});

export const noteTypeJsonSchema = z.object({
  name: z.string().min(1, "Note Type 名称不能为空").max(64),
  fields: z.array(fieldSchema).min(1, "至少 1 个字段"),
  templates: z.array(cardTemplateSchema).min(1, "至少 1 个卡片模板"),
});

export type NoteTypeJson = z.infer<typeof noteTypeJsonSchema>;

// ─── Deck create / update (DECK-01) ─────────────────────────────────────

export const deckCreateSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal("")),
  shuffleOptions: z.boolean().default(true),
});

export const deckUpdateSchema = deckCreateSchema.extend({
  id: z.string().min(1),
});

export type DeckCreateInput = z.infer<typeof deckCreateSchema>;
export type DeckUpdateInput = z.infer<typeof deckUpdateSchema>;

// ─── Deck theme color (Phase 5 redesign) ──────────────────────────────
//
// Stored as an HSL triplet (no `hsl()` wrapper) so it composes
// directly with `hsl(var(--token) / 0.X)` alpha-tinted expressions.
// The form sends hex via `<input type="color">`; the action
// converts hex → HSL via `hexToHsl` and validates the shape.

const HSL_TRIPLET = /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/;

export const themeColorSchema = z
  .string()
  .trim()
  .regex(HSL_TRIPLET, "颜色格式无效（H S% L%）")
  .nullable();

export type ThemeColor = z.infer<typeof themeColorSchema>;

// ─── Card (CARD-01..07) ────────────────────────────────────────

// Shared type used by <CardForm> for the NoteType fields it renders in
// the 笔记 (NoteType field values) section.
export type NoteTypeField = { id: string; name: string };

export const CARD_TYPES = ["choice", "multi_choice", "fill", "qa", "judge"] as const;
export type CardType = (typeof CARD_TYPES)[number];

const choiceData = z.object({
  type: z.literal("choice"),
  options: z.string().array().min(2, "至少 2 个选项"),
  answer: z.number().int().nonnegative(),
  shuffle: z.boolean().default(true),
  // Phase 04-06 Feature B: pin the last option to the bottom during
  // shuffle. Other options shuffle freely; the last one stays last.
  // Optional + defaults false so existing rows still parse.
  pinLastOption: z.boolean().default(false),
});

const multiChoiceData = z.object({
  type: z.literal("multi_choice"),
  options: z.string().array().min(2, "至少 2 个选项"),
  answers: z.number().int().nonnegative().array().min(1, "至少选 1 个正确答案"),
  shuffle: z.boolean().default(true),
  pinLastOption: z.boolean().default(false),
});

const fillData = z.object({
  type: z.literal("fill"),
  answers: z.string().min(1, "答案不能为空").array().min(1, "至少提供 1 个等价答案"),
});

const qaData = z.object({
  type: z.literal("qa"),
});

const judgeData = z.object({
  type: z.literal("judge"),
  correct: z.boolean(),
});

export const cardTypeDataSchema = z
  .discriminatedUnion("type", [
    choiceData,
    multiChoiceData,
    fillData,
    qaData,
    judgeData,
  ])
  .superRefine((data, ctx) => {
    if (data.type === "choice" && data.answer >= data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "answer 越界",
        path: ["answer"],
      });
    }
    if (data.type === "multi_choice") {
      const max = data.options.length;
      const dup = new Set<number>();
      for (const a of data.answers) {
        if (a >= max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `answers ${a} 越界`,
            path: ["answers"],
          });
        }
        if (dup.has(a)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `重复答案 ${a}`,
            path: ["answers"],
          });
        }
        dup.add(a);
      }
    }
  });

export type CardTypeData = z.infer<typeof cardTypeDataSchema>;

export const cardCreateSchema = z.object({
  deckId: z.string().min(1),
  // Raised from 20k to allow inline base64 images (data: URIs) embedded in
  // markdown. A 2 MB image base64-encodes to ~2.7M chars; this cap leaves room
  // for a couple of images plus text per field. The tradeoff (DB / payload
  // bloat) is accepted per the chosen base64-inline image strategy.
  frontContent: z
    .string()
    .max(8_000_000)
    .min(1, "问题不能为空"),
  backContent: z.string().max(8_000_000).default(""),
  typeData: cardTypeDataSchema,
  fields: z.record(z.string(), z.string()).default({}),
  isFavorite: z.boolean().default(false),
  suspended: z.boolean().default(false),
  // Phase 04-06 Feature A: per-card override for Deck.shuffleOptions.
  // When true, this card never shuffles its options regardless of the
  // deck-level setting. Default false → card follows the deck.
  shuffleOptOut: z.boolean().default(false),
});

export const cardUpdateSchema = cardCreateSchema
  .extend({
    id: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    // Qa cards require a backContent on update; for non-qa types the
    // backContent is the optional explanation and may stay empty.
    if (data.typeData.type === "qa" && !data.backContent.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "问答题的答案不能为空",
        path: ["backContent"],
      });
    }
  });

export type CardCreateInput = z.infer<typeof cardCreateSchema>;
export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;

// ─── Study (Phase 06-02) ───────────────────────────────────────
//
// `rating` matches the 1..4 user-facing API exposed by the Phase 7
// study session UI (1=Again, 2=Hard, 3=Good, 4=Easy). The HTTP /
// Server-Action boundary keeps this contract; the lib layer maps
// the integer to a ts-fsrs `Grade` via RATING_FROM_API.

export const studyAnswerSchema = z.object({
  cardId: z.string().min(1, "缺少 cardId"),
  rating: z
    .number()
    .int()
    .min(1, "rating 必须在 1..4")
    .max(4, "rating 必须在 1..4"),
});

export type StudyAnswerInput = z.infer<typeof studyAnswerSchema>;

export const studyUndoSchema = z.object({
  cardId: z.string().min(1, "缺少 cardId"),
});

export type StudyUndoInput = z.infer<typeof studyUndoSchema>;

// ─── Study Plan (Phase 08-01 / 08-04) ────────────────────────────
//
// Deck-level Study Plan form fields. Bounds rationale:
//   - requestRetention 0.7..0.97 — FSRS empirical range. < 0.7 the
//     scheduler computes intervals too short (1+ review per card
//     per day); > 0.97 the scheduler barely schedules anything
//     (cards are deemed "well-known" after one review). Anki docs
//     recommend staying inside this window.
//   - newPerDay / reviewsPerDay 0..9999 — 0 is the legal "paused
//     today" state (user on vacation / saturated). 9999 is a sane
//     upper guard against accidental overflows. 32-bit int headroom
//     is irrelevant; this is a daily cap, not a lifetime count.
//   - enableFuzz / enableShortTerm — boolean, no bounds. ts-fsrs
//     treats these as hard switches and the project only ships
//     `true` for both via FSRS_RECOMMENDED_VALUES.
//   - firstSessionTargetProgress 0.5..1.0 (Phase 08-04) — minimum
//     Card.progress for a new card to graduate to the review
//     bucket. < 0.5: too easy (almost every card graduates
//     immediately). > 1.0: mathematically impossible (progress is
//     < 1 for any positive difficulty). 0.80 is the FSRS 6 default
//     and the schema default.
export const studyPlanSchema = z.object({
  newPerDay: z.number().int().min(0).max(9999),
  reviewsPerDay: z.number().int().min(0).max(9999),
  requestRetention: z.number().min(0.7).max(0.97),
  enableFuzz: z.boolean(),
  enableShortTerm: z.boolean(),
  firstSessionTargetProgress: z.number().min(0.5).max(1.0),
  // Phase 14: 2/3/4-key rating-bar collapse (study UX, not a scheduler knob;
  // the emitted grade stays 1..4). Validated to exactly 2 | 3 | 4.
  ratingButtons: z
    .number()
    .int()
    .refine((v) => v === 2 || v === 3 || v === 4, "选项数量必须是 2/3/4"),
  // Phase 14: grade a new card's Good press as Easy.
  newRememberAsEasy: z.boolean(),
});

export type StudyPlanInput = z.infer<typeof studyPlanSchema>;
