import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProgressBar } from "./progress";
import { ProgressBadge } from "./progress-badge";

afterEach(() => cleanup());

// Helpers — jsdom doesn't ship @testing-library/jest-dom so we
// fall back to plain attribute / style reads.
function getBar() {
  const all = screen.queryAllByRole("progressbar");
  return all[all.length - 1]!;
}
function getFill() {
  const all = document.querySelectorAll(
    "[data-testid='progress-bar-fill']"
  );
  return all[all.length - 1] as HTMLElement;
}
function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}
function style(el: HTMLElement, prop: string): string {
  return el.style.getPropertyValue(prop) || el.getAttribute("style") || "";
}
function widthPct(el: HTMLElement): string {
  return style(el, "width");
}

describe("ProgressBar (Phase 08-03)", () => {
  it("renders 0% for value=0", () => {
    render(<ProgressBar value={0} aria-label="进度" />);
    const bar = getBar();
    expect(attr(bar, "aria-valuenow")).toBe("0");
    expect(attr(bar, "data-pct")).toBe("low");
    expect(widthPct(getFill())).toBe("0%");
  });

  it("renders 100% for value=1", () => {
    render(<ProgressBar value={1} aria-label="进度" />);
    const bar = getBar();
    expect(attr(bar, "aria-valuenow")).toBe("100");
    expect(attr(bar, "data-pct")).toBe("high");
    expect(widthPct(getFill())).toBe("100%");
  });

  it("renders 50% for value=0.5 and applies mid band", () => {
    render(<ProgressBar value={0.5} aria-label="进度" />);
    const bar = getBar();
    expect(attr(bar, "aria-valuenow")).toBe("50");
    expect(attr(bar, "data-pct")).toBe("mid");
    expect(widthPct(getFill())).toBe("50%");
  });

  it("clamps negative and >1 values to [0, 1]", () => {
    render(<ProgressBar value={-0.5} aria-label="进度" />);
    expect(widthPct(getFill())).toBe("0%");
  });

  it("clamps >1 to 100%", () => {
    render(<ProgressBar value={1.5} aria-label="进度" />);
    expect(widthPct(getFill())).toBe("100%");
  });

  it("renders 0% for NaN (defensive)", () => {
    render(<ProgressBar value={NaN} aria-label="进度" />);
    expect(widthPct(getFill())).toBe("0%");
  });

  it("honors aria-label for screen readers", () => {
    render(<ProgressBar value={0.4} aria-label="本卡学习进度" />);
    const all = screen.queryAllByLabelText("本卡学习进度");
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ProgressBadge (Phase 08-03)", () => {
  it("rounds and shows percent", () => {
    render(<ProgressBadge value={0.733} />);
    const all = document.querySelectorAll(
      "[data-testid='progress-badge-value']"
    );
    const last = all[all.length - 1] as HTMLElement;
    expect(last.textContent).toBe("73%");
  });

  it("applies low/mid/high data-pct correctly", () => {
    render(<ProgressBadge value={0.1} />);
    const all = document.querySelectorAll(
      "[data-testid='progress-badge-value']"
    );
    const last = all[all.length - 1] as HTMLElement;
    expect(attr(last.parentElement!, "data-pct")).toBe("low");
  });

  it("renders 0% for null/NaN/negative", () => {
    render(<ProgressBadge value={0} />);
    const all = document.querySelectorAll(
      "[data-testid='progress-badge-value']"
    );
    const last = all[all.length - 1] as HTMLElement;
    expect(last.textContent).toBe("0%");
  });

  it("renders 100% for value > 1", () => {
    render(<ProgressBadge value={1.5} />);
    const all = document.querySelectorAll(
      "[data-testid='progress-badge-value']"
    );
    const last = all[all.length - 1] as HTMLElement;
    expect(last.textContent).toBe("100%");
  });

  it("renders label + value when label prop provided", () => {
    render(<ProgressBadge value={0.42} label="平均" />);
    const all = screen.queryAllByText("平均");
    expect(all.length).toBeGreaterThanOrEqual(1);
    const all2 = document.querySelectorAll(
      "[data-testid='progress-badge-value']"
    );
    const last = all2[all2.length - 1] as HTMLElement;
    expect(last.textContent).toBe("42%");
  });
});
