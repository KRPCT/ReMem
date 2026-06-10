import { describe, it, expect } from "vitest";
import { State } from "ts-fsrs";
import {
  toFsrsCard,
  fromFsrsCard,
  STATE_NAME_TO_NUM,
  STATE_NUM_TO_NAME,
} from "./card-adapter";

describe("toFsrsCard", () => {
  it("returns an empty card when CardState is null", () => {
    const now = new Date("2026-06-07T00:00:00Z");
    const card = toFsrsCard(null, now);

    expect(card.state).toBe(State.New);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.learning_steps).toBe(0);
    expect(card.due.getTime()).toBe(now.getTime());
  });

  it("maps a full CardState row to the matching fsrs Card", () => {
    const now = new Date("2026-06-07T00:00:00Z");
    const due = new Date("2026-06-08T00:00:00Z");
    const card = toFsrsCard(
      {
        state: "new",
        stability: 0.5,
        difficulty: 3.2,
        elapsedDays: 1,
        scheduledDays: 5,
        reps: 2,
        lapses: 0,
        lastReview: null,
        due,
      } as never,
      now
    );

    expect(card.state).toBe(State.New);
    expect(card.stability).toBe(0.5);
    expect(card.difficulty).toBe(3.2);
    expect(card.elapsed_days).toBe(1);
    expect(card.scheduled_days).toBe(5);
    expect(card.reps).toBe(2);
    expect(card.lapses).toBe(0);
    expect(card.due.getTime()).toBe(due.getTime());
    expect(card.last_review).toBeUndefined();
    expect(card.learning_steps).toBe(0);
  });

  it("preserves lastReview when present", () => {
    const now = new Date("2026-06-07T00:00:00Z");
    const lastReview = new Date("2026-06-01T00:00:00Z");
    const card = toFsrsCard(
      {
        state: "review",
        stability: 1,
        difficulty: 5,
        elapsedDays: 6,
        scheduledDays: 6,
        reps: 1,
        lapses: 0,
        lastReview,
        due: new Date("2026-06-07T00:00:00Z"),
      } as never,
      now
    );
    expect(card.last_review).toBeInstanceOf(Date);
    expect((card.last_review as Date).getTime()).toBe(lastReview.getTime());
  });

  it("leaves lastReview undefined when null", () => {
    const now = new Date("2026-06-07T00:00:00Z");
    const card = toFsrsCard(
      {
        state: "review",
        stability: 1,
        difficulty: 5,
        elapsedDays: 6,
        scheduledDays: 6,
        reps: 1,
        lapses: 0,
        lastReview: null,
        due: new Date("2026-06-07T00:00:00Z"),
      } as never,
      now
    );
    expect(card.last_review).toBeUndefined();
  });

  it("maps all 4 state strings to the matching State enum", () => {
    const now = new Date("2026-06-07T00:00:00Z");
    expect(STATE_NAME_TO_NUM.new).toBe(State.New);
    expect(STATE_NAME_TO_NUM.learning).toBe(State.Learning);
    expect(STATE_NAME_TO_NUM.review).toBe(State.Review);
    expect(STATE_NAME_TO_NUM.relearning).toBe(State.Relearning);

    expect(STATE_NUM_TO_NAME[State.New]).toBe("new");
    expect(STATE_NUM_TO_NAME[State.Learning]).toBe("learning");
    expect(STATE_NUM_TO_NAME[State.Review]).toBe("review");
    expect(STATE_NUM_TO_NAME[State.Relearning]).toBe("relearning");

    const make = (state: "new" | "learning" | "review" | "relearning") =>
      toFsrsCard(
        {
          state,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          lastReview: null,
          due: now,
        } as never,
        now
      );

    expect(make("new").state).toBe(State.New);
    expect(make("learning").state).toBe(State.Learning);
    expect(make("review").state).toBe(State.Review);
    expect(make("relearning").state).toBe(State.Relearning);
  });
});

describe("fromFsrsCard", () => {
  it("round-trips the 9 CardState fields", () => {
    const now = new Date("2026-06-07T00:00:00Z");
    const lastReview = new Date("2026-06-01T00:00:00Z");
    const due = new Date("2026-06-08T00:00:00Z");
    const input = {
      state: "review",
      stability: 1.234,
      difficulty: 5.6,
      elapsedDays: 7,
      scheduledDays: 8,
      reps: 9,
      lapses: 0,
      lastReview,
      due,
    } as const;
    const fsrsCard = toFsrsCard(input as never, now);
    const back = fromFsrsCard(fsrsCard, "u1");

    expect(back.stability).toBe(input.stability);
    expect(back.difficulty).toBe(input.difficulty);
    expect(back.elapsedDays).toBe(input.elapsedDays);
    expect(back.scheduledDays).toBe(input.scheduledDays);
    expect(back.reps).toBe(input.reps);
    expect(back.lapses).toBe(input.lapses);
    expect(back.state).toBe(input.state);
    expect(back.lastReview).toBeInstanceOf(Date);
    expect((back.lastReview as Date).getTime()).toBe(lastReview.getTime());
    expect(back.due).toBeInstanceOf(Date);
    expect(back.due.getTime()).toBe(due.getTime());
    expect(back.userId).toBe("u1");
  });

  it("preserves Date types for due and lastReview (not strings)", () => {
    const now = new Date("2026-06-07T00:00:00Z");
    const fsrsCard = toFsrsCard(null, now);
    const back = fromFsrsCard(fsrsCard, "u1");
    expect(back.due).toBeInstanceOf(Date);
    expect(back.lastReview).toBeNull();
  });
});
