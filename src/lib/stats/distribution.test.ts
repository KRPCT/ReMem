import { describe, it, expect } from "vitest";
import { bucketCardStates } from "./distribution";

/** Build a card-with-state fixture; `null` means no CardState row. */
const card = (state: string | null) => ({
  cardState: state === null ? null : { state },
});

describe("bucketCardStates", () => {
  it("counts each of the four mutually-exclusive buckets", () => {
    const dist = bucketCardStates([
      card("new"),
      card("learning"),
      card("learning"),
      card("review"),
      card("review"),
      card("review"),
      card("relearning"),
    ]);
    expect(dist).toEqual({ new: 1, learning: 2, review: 3, lapsed: 1, total: 7 });
  });

  it("treats a missing CardState row as `new` (D-11)", () => {
    const dist = bucketCardStates([card(null), card(null), card("review")]);
    expect(dist.new).toBe(2);
    expect(dist.review).toBe(1);
  });

  it("maps `relearning` to `lapsed` (D-10, not the historical lapses>0 count)", () => {
    const dist = bucketCardStates([card("relearning"), card("relearning")]);
    expect(dist.lapsed).toBe(2);
    expect(dist.new).toBe(0);
  });

  it("total === cards.length and buckets sum to total (mutual exclusivity)", () => {
    const cards = [
      card("new"),
      card(null),
      card("learning"),
      card("review"),
      card("relearning"),
    ];
    const d = bucketCardStates(cards);
    expect(d.total).toBe(cards.length);
    expect(d.new + d.learning + d.review + d.lapsed).toBe(d.total);
  });

  it("unknown state folds into `new` (buckets still sum to total)", () => {
    const d = bucketCardStates([card("???"), card("review")]);
    expect(d.new).toBe(1);
    expect(d.new + d.learning + d.review + d.lapsed).toBe(d.total);
  });

  it("empty input → all zeros", () => {
    expect(bucketCardStates([])).toEqual({
      new: 0,
      learning: 0,
      review: 0,
      lapsed: 0,
      total: 0,
    });
  });
});
