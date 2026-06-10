import { describe, it, expect } from "vitest";
import { bucketReviewsByDay, HEATMAP_WINDOW_DAYS } from "./heatmap";

// Fixed local-midnight window end → deterministic fixtures (no DB, no clock).
const END = new Date(2026, 5, 9); // 2026-06-09 local

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOffset = (days: number) => {
  const d = new Date(END);
  d.setDate(END.getDate() + days);
  return d;
};

describe("bucketReviewsByDay", () => {
  it("returns exactly 365 entries, oldest first, ending today", () => {
    const out = bucketReviewsByDay([], END);
    expect(out).toHaveLength(HEATMAP_WINDOW_DAYS);
    expect(out[364].date).toBe("2026-06-09");
    expect(out[0].date).toBe(keyOf(dayOffset(-364)));
  });

  it("every date matches YYYY-MM-DD and order is strictly ascending", () => {
    const out = bucketReviewsByDay([], END);
    expect(out.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].date > out[i - 1].date).toBe(true);
    }
  });

  it("empty input → all counts are 0", () => {
    const out = bucketReviewsByDay([], END);
    expect(out.every((d) => d.count === 0)).toBe(true);
  });

  it("sums multiple reviews on the same local day", () => {
    const ts = [
      new Date(2026, 5, 9, 8, 0),
      new Date(2026, 5, 9, 12, 30),
      new Date(2026, 5, 9, 23, 0),
    ];
    const out = bucketReviewsByDay(ts, END);
    expect(out.find((d) => d.date === "2026-06-09")!.count).toBe(3);
  });

  it("keeps zero-review days between active days", () => {
    const out = bucketReviewsByDay([new Date(2026, 5, 7, 10, 0)], END);
    expect(out.find((d) => d.date === "2026-06-07")!.count).toBe(1);
    expect(out.find((d) => d.date === "2026-06-08")!.count).toBe(0);
    expect(out.find((d) => d.date === "2026-06-09")!.count).toBe(0);
  });

  it("local day boundary: 23:59 and next-day 00:01 land in different buckets", () => {
    const ts = [new Date(2026, 5, 8, 23, 59), new Date(2026, 5, 9, 0, 1)];
    const out = bucketReviewsByDay(ts, END);
    expect(out.find((d) => d.date === "2026-06-08")!.count).toBe(1);
    expect(out.find((d) => d.date === "2026-06-09")!.count).toBe(1);
  });

  it("excludes timestamps outside the 365-day window", () => {
    const ts = [
      dayOffset(1), // tomorrow — after window end
      new Date(2020, 0, 1), // far before window start
      new Date(2026, 5, 9, 9, 0), // in window
    ];
    const out = bucketReviewsByDay(ts, END);
    const total = out.reduce((acc, d) => acc + d.count, 0);
    expect(total).toBe(1);
    expect(out.find((d) => d.date === "2026-06-09")!.count).toBe(1);
  });
});
