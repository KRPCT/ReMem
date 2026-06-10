import { describe, it, expect } from "vitest";
import type { CardState } from "@prisma/client";
import { fsrsStrategy } from "./strategy";

const NOW = new Date("2026-06-09T00:00:00Z");

function run(
  state: CardState | null,
  rating: number,
  threshold = 1.0,
  prevProgress = 0
) {
  return fsrsStrategy.schedule({
    state,
    rating,
    now: NOW,
    threshold,
    userId: "u1",
    prevProgress,
  });
}

/** Build a CardState-shaped row from a strategy write payload (for feeding
 *  one answer's result back in as the next answer's pre-state). */
function asState(write: ReturnType<typeof run>["write"]): CardState {
  return {
    id: "cs",
    cardId: "c",
    createdAt: NOW,
    updatedAt: NOW,
    ...write, // includes userId
  } as CardState;
}

describe("fsrsStrategy (extracted algorithm)", () => {
  it("throws on a rating outside 1..4", () => {
    expect(() => run(null, 5)).toThrow("rating 必须是 1..4");
    expect(() => run(null, 0)).toThrow("rating 必须是 1..4");
  });

  it("new card + Good → learning, below threshold → requeue this session", () => {
    const r = run(null, 3); // threshold 1.0
    expect(r.write.state).toBe("learning");
    expect(r.graduated).toBe(false);
    expect(r.requeueInSession).toBe(true);
    expect(r.progress).toBeCloseTo(0.62, 2); // v2 first-day Good step
  });

  it("new card + Easy → ts-fsrs graduates to review → no requeue", () => {
    const r = run(null, 4);
    expect(r.write.state).toBe("review");
    expect(r.graduated).toBe(true);
    expect(r.requeueInSession).toBe(false);
  });

  it("first-session graduation: new + Good, threshold 0.6 → review (S=1.0), no requeue", () => {
    const r = run(null, 3, 0.6); // progress 0.67 >= 0.6
    expect(r.write.state).toBe("review");
    expect(r.write.stability).toBe(1.0);
    expect(r.write.learningSteps).toBe(0);
    expect(r.graduated).toBe(true);
    expect(r.requeueInSession).toBe(false);
  });

  it("persists learning_steps so a 2nd Good graduates learning → review", () => {
    const first = run(null, 3); // new + Good → learning, step advanced
    expect(first.write.state).toBe("learning");
    expect(first.write.learningSteps).toBeGreaterThanOrEqual(1);

    // Feed the first result back in as the pre-answer state — the
    // persisted learning_steps is what lets the 2nd Good graduate.
    const second = run(asState(first.write), 3);
    expect(second.write.state).toBe("review");
    expect(second.graduated).toBe(true);
    expect(second.requeueInSession).toBe(false);
  });

  it("WITHOUT persisted learning_steps a 2nd Good would NOT graduate (regression guard)", () => {
    const first = run(null, 3);
    // Simulate the old bug: reset learning_steps to 0 on the carried state.
    const bugged = asState({ ...first.write, learningSteps: 0 });
    const second = run(bugged, 3);
    expect(second.write.state).toBe("learning"); // stuck — proves the fix matters
  });
});
