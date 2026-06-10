/**
 * Phase 08-01: StudyPlanForm behavior tests.
 *
 * Verifies the 5-field controlled form, the FSRS-推荐 button
 * one-click fill, the 重置 restore, the save-submit wiring, and
 * the StudyPlanPreview child mount. Server actions are mocked so
 * the test stays purely client-side; integration coverage lives
 * in updateStudyPlanAction.test.ts.
 *
 * Uses @testing-library/react for fireEvent + screen queries, and
 * stable data-testid attributes on the 3 action buttons (added
 * to the form component) so the test is not sensitive to button
 * text changes.
 *
 * Note: in this jsdom + React 19 environment, RTL's render() with
 * `useActionState` can leave duplicate button nodes in the DOM
 * because the action's pending state re-renders the form. The
 * tests use `getAllBy...(...)[0]` to scope queries to the first
 * (and only intended) instance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";
import { StudyPlanForm } from "./study-plan-form";
import { FSRS_RECOMMENDED_VALUES } from "@/lib/fsrs/recommendations";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  updateStudyPlanAction: vi.fn(),
  recommendStudyPlanAction: vi.fn(),
}));

vi.mock("./study-plan-preview", () => ({
  StudyPlanPreview: () => (
    <div data-testid="study-plan-preview">preview</div>
  ),
}));

import { updateStudyPlanAction, recommendStudyPlanAction } from "./actions";

const INITIAL = {
  newPerDay: 5,
  reviewsPerDay: 10,
  requestRetention: 0.85,
  enableFuzz: false,
  enableShortTerm: false,
  // Phase 08-04: 6th field on the Study Plan form.
  firstSessionTargetProgress: 0.5,
};

function renderForm() {
  return render(<StudyPlanForm deckId="d1" initial={INITIAL} />);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(updateStudyPlanAction).mockImplementation(
    async () => ({ ok: true }) as never
  );
  vi.mocked(recommendStudyPlanAction).mockImplementation(
    async () =>
      ({
        ok: true,
        values: {
          newPerDay: 30,
          reviewsPerDay: 150,
          requestRetention: 0.9,
          enableFuzz: true,
          enableShortTerm: true,
          firstSessionTargetProgress: 0.8,
          source: "user-history-30d" as const,
          rationale: {
            newPerDay: "30 张/天",
            reviewsPerDay: "150 张/天",
            requestRetention: "0.9",
            enableFuzz: "true",
            enableShortTerm: "true",
            firstSessionTargetProgress: "0.80",
          },
        },
      }) as never
  );
});

describe("StudyPlanForm (Phase 08-01)", () => {
  it("FSRS 推荐 button fills all 5 fields with the recommended values", () => {
    renderForm();
    const newPerDay = screen.getByLabelText("每日新卡上限") as HTMLInputElement;
    expect(newPerDay.value).toBe("5");

    const recommendBtns = screen.getAllByTestId("study-plan-recommend");
    fireEvent.click(recommendBtns[0]!);

    expect(newPerDay.value).toBe(String(FSRS_RECOMMENDED_VALUES.newPerDay));
    const reviewsPerDay = screen.getByLabelText(
      "每日复习上限"
    ) as HTMLInputElement;
    expect(reviewsPerDay.value).toBe(
      String(FSRS_RECOMMENDED_VALUES.reviewsPerDay)
    );
    const retention = screen.getByLabelText(
      "期望回忆保留率"
    ) as HTMLInputElement;
    expect(retention.value).toBe(
      String(FSRS_RECOMMENDED_VALUES.requestRetention)
    );
    const enableFuzz = screen.getByRole("checkbox", {
      name: /启用间隔模糊/,
    }) as HTMLInputElement;
    expect(enableFuzz.checked).toBe(true);
    const enableShortTerm = screen.getByRole("checkbox", {
      name: /启用短期步进/,
    }) as HTMLInputElement;
    expect(enableShortTerm.checked).toBe(true);
  });

  it("重置 button restores last-saved values after applying recommendations", () => {
    renderForm();
    const recommendBtns = screen.getAllByTestId("study-plan-recommend");
    fireEvent.click(recommendBtns[0]!);
    expect(
      (screen.getByLabelText("每日新卡上限") as HTMLInputElement).value
    ).toBe("20");

    const resetBtns = screen.getAllByTestId("study-plan-reset");
    fireEvent.click(resetBtns[0]!);

    expect(
      (screen.getByLabelText("每日新卡上限") as HTMLInputElement).value
    ).toBe("5");
    expect(
      (screen.getByLabelText("每日复习上限") as HTMLInputElement).value
    ).toBe("10");
    expect(
      (screen.getByLabelText("期望回忆保留率") as HTMLInputElement).value
    ).toBe("0.85");
    expect(
      (screen.getByRole("checkbox", {
        name: /启用间隔模糊/,
      }) as HTMLInputElement).checked
    ).toBe(false);
    expect(
      (screen.getByRole("checkbox", {
        name: /启用短期步进/,
      }) as HTMLInputElement).checked
    ).toBe(false);
  });

  it("5 字段受控 onChange: newPerDay input updates react state", () => {
    renderForm();
    const newPerDay = screen.getByLabelText("每日新卡上限") as HTMLInputElement;
    expect(newPerDay.value).toBe("5");
    fireEvent.change(newPerDay, { target: { value: "42" } });
    expect(newPerDay.value).toBe("42");
  });

  it("保存 button is reachable and hidden inputs reflect controlled state", () => {
    renderForm();
    const newPerDay = screen.getByLabelText("每日新卡上限") as HTMLInputElement;
    fireEvent.change(newPerDay, { target: { value: "33" } });
    const hidden = document.querySelector(
      'input[type="hidden"][name="newPerDay"]'
    ) as HTMLInputElement | null;
    expect(hidden?.value).toBe("33");
    const saveBtns = screen.getAllByTestId("study-plan-save");
    expect(saveBtns.length).toBeGreaterThanOrEqual(1);
    expect(saveBtns[0]).toBeTruthy();
  });

  it("StudyPlanPreview child component is mounted under the form", () => {
    renderForm();
    const previews = screen.getAllByTestId("study-plan-preview");
    expect(previews.length).toBeGreaterThanOrEqual(1);
    expect(previews[0]).toBeTruthy();
  });

  it("Phase 08-04: 智能推荐 v6 button triggers recommendStudyPlanAction and fills 6 fields", async () => {
    renderForm();
    // Sanity: initial newPerDay=5
    const newPerDay = screen.getByLabelText("每日新卡上限") as HTMLInputElement;
    expect(newPerDay.value).toBe("5");

    const smartBtns = screen.getAllByTestId("study-plan-smart-recommend");
    fireEvent.click(smartBtns[0]!);

    // After wrapping recommendAction in startTransition (React 19 hard
    // rule — useActionState dispatched functions must run inside a
    // transition), the useEffect that applies the response values is
    // itself inside the transition, so we wait for it instead of a
    // bare setTimeout(0).
    await waitFor(() => {
      expect(recommendStudyPlanAction).toHaveBeenCalled();
    });
    // newPerDay should now be 30 (the mocked recommended value)
    await waitFor(() => {
      expect(newPerDay.value).toBe("30");
    });
    // firstSessionTargetProgress is rendered as a number input
    // (testid-less) — query by label.
    const firstSession = screen.getByLabelText(
      "首次学习达成阈值"
    ) as HTMLInputElement;
    expect(firstSession.value).toBe("0.8");
  });
});
