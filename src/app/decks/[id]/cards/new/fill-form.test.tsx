import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { FillForm } from "./fill-form";

afterEach(() => {
  cleanup();
});

/**
 * The FillForm now owns a MarkdownEditor ref + a per-cloze answers
 * UI. The test below exercises the public props and the
 * imperative `insertCloze` button — the spec is:
 *
 *   - Without `{{cN::}}` markers in the question, render the
 *     legacy flat-list "可接受答案" UI.
 *   - With markers, render one "第 N 空" group per marker.
 *   - "插入挖空" appends a fresh answer slot and is a no-op for
 *     the question text in unit tests (the editor ref + cursor
 *     path is jsdom-hostile, so we just assert the answers grow).
 */
describe("FillForm (CARD-04)", () => {
  it("renders the legacy flat-list UI when the question has no cloze markers", () => {
    render(
      <FillForm
        value={{ type: "fill", answers: ["Paris", "City of Light"] }}
        onChange={() => {}}
        question="The capital of France is ____."
        onQuestionChange={() => {}}
      />
    );
    // Legacy UI: "可接受答案" label + flat inputs.
    expect(screen.getByText(/可接受答案/)).toBeDefined();
    // The per-cloze groups should NOT render.
    expect(screen.queryByText(/第 1 空/)).toBeNull();
  });

  it("renders per-cloze answer groups for each {{cN::hint}} marker", () => {
    render(
      <FillForm
        value={{ type: "fill", answers: ["Paris", "Licht"] }}
        onChange={() => {}}
        question="The capital of {{c1::France}} is {{c2::Paris}}, the {{c3::City of Light}}."
        onQuestionChange={() => {}}
      />
    );
    // Three cloze groups, one per marker. The markerIndex (N) is
    // taken from the cloze marker, so we expect "第 1 空", "第 2 空",
    // "第 3 空" regardless of the order in the array.
    expect(screen.getByText(/第 1 空/)).toBeDefined();
    expect(screen.getByText(/第 2 空/)).toBeDefined();
    expect(screen.getByText(/第 3 空/)).toBeDefined();
  });

  it("shows the inline hint from the question in the cloze header", () => {
    render(
      <FillForm
        value={{ type: "fill", answers: ["Paris"] }}
        onChange={() => {}}
        question="The capital of {{c1::France}} is Paris."
        onQuestionChange={() => {}}
      />
    );
    // The hint "France" is rendered next to the "第 1 空" label.
    expect(screen.getByText(/提示：France/)).toBeDefined();
  });

  // {{#N}} — the index-only cloze syntax. Must produce per-cloze
  // groups just like {{cN::hint}} does. Regression test for the
  // prior bug where the form's parser called `source.indexOf`
  // per match and clobbered duplicate positions.
  it("renders per-cloze groups for {{#N}} markers", () => {
    render(
      <FillForm
        value={{ type: "fill", answers: ["France", "Paris"] }}
        onChange={() => {}}
        question="The capital of {{#1}} is {{#2}}."
        onQuestionChange={() => {}}
      />
    );
    expect(screen.getByText(/第 1 空/)).toBeDefined();
    expect(screen.getByText(/第 2 空/)).toBeDefined();
  });

  it("distinguishes duplicate {{#N}} markers (each gets a unique group)", () => {
    // Pre-fix: source.indexOf always returned the FIRST occurrence,
    // so {{#1}} {{#1}} produced two groups pointing at answers[0].
    // The fix: parser records each match's REAL start position.
    render(
      <FillForm
        value={{ type: "fill", answers: ["a", "b"] }}
        onChange={() => {}}
        question="{{#1}} and {{#1}} again"
        onQuestionChange={() => {}}
      />
    );
    // Two "第 1 空" headers with the same markerIndex — they
    // both point at answers[0] (the first answer is the right
    // answer for both blanks). The form should still render two
    // groups, not collapse them.
    const headers = screen.getAllByText(/第 1 空/);
    expect(headers.length).toBe(2);
  });

  it("highestClozeIndex counts both {{cN::}} and {{#N}} forms", () => {
    // We exercise via a re-render flow: type a question that mixes
    // cN:: (highest = 3) with #N (highest = 5) and confirm the
    // form correctly detects 5 as the next insertion index.
    const { rerender } = render(
      <FillForm
        value={{ type: "fill", answers: ["x", "y", "z", "w", "v"] }}
        onChange={() => {}}
        question="a {{c3::hint}} b {{#5}}"
        onQuestionChange={() => {}}
      />
    );
    // The 6th cloze hasn't been inserted yet — verify that the
    // 5th answer slot ("v") is the one mapped to {{#5}}.
    const inputs = screen.getAllByLabelText(/第 5 空答案/);
    expect(inputs.length).toBe(1);
    expect((inputs[0] as HTMLInputElement).value).toBe("v");
    // Re-render with one more #N marker (highest = 6) — the new
    // marker should be detected and an empty 6th slot should
    // appear.
    rerender(
      <FillForm
        value={{ type: "fill", answers: ["x", "y", "z", "w", "v", ""] }}
        onChange={() => {}}
        question="a {{c3::hint}} b {{#5}} c {{#6}}"
        onQuestionChange={() => {}}
      />
    );
    const sixthInputs = screen.getAllByLabelText(/第 6 空答案/);
    expect(sixthInputs.length).toBe(1);
  });

  // The form and the renderer MUST agree on the answer-array
  // index for each cloze. The form uses markerIndex-1 to bind
  // the primary input; the renderer uses answers[c.index - 1] to
  // display the revealed answer. If either drifts, the user sees
  // one answer in the form and a different one in study mode.
  // This test pins the contract end-to-end for {{#N}}.
  it("form primary input matches the renderer's answer lookup for {{#N}}", () => {
    // Question: two {{#N}} clozes with non-sequential-ish but
    // testable marker indices. Answers: 6 elements. The
    // renderer (card-body.tsx) reads answers[0] for c1, answers[1]
    // for c2. The form MUST bind the same slots.
    render(
      <FillForm
        value={{ type: "fill", answers: ["France", "Paris"] }}
        onChange={() => {}}
        question="The capital of {{#1}} is {{#2}}."
        onQuestionChange={() => {}}
      />
    );
    const group1 = screen.getByLabelText(/第 1 空答案/) as HTMLInputElement;
    const group2 = screen.getByLabelText(/第 2 空答案/) as HTMLInputElement;
    expect(group1.value).toBe("France"); // answers[0] for renderer too
    expect(group2.value).toBe("Paris");  // answers[1] for renderer too
  });

  it("insertCloze button adds a new answer slot for the next cloze", () => {
    const onChange = vi.fn();
    render(
      <FillForm
        value={{ type: "fill", answers: ["Paris"] }}
        onChange={onChange}
        question="The capital of {{c1::France}} is Paris."
        onQuestionChange={() => {}}
      />
    );
    // Click the "插入挖空" button. The form exposes one button
    // (inserts {{cN::}} with hint slot); {{#N}} is also accepted
    // on render when typed manually.
    fireEvent.click(screen.getByRole("button", { name: "插入挖空" }));
    // onChange should be called with a new answer slot.
    expect(onChange).toHaveBeenCalledTimes(1);
    const nextValue = onChange.mock.calls[0][0];
    expect(nextValue.answers.length).toBe(2);
  });

  it("does not show the legacy flat list when clozes are present", () => {
    render(
      <FillForm
        value={{ type: "fill", answers: ["x"] }}
        onChange={() => {}}
        question="Fill the blank: {{c1::hint}}"
        onQuestionChange={() => {}}
      />
    );
    expect(screen.queryByText(/可接受答案/)).toBeNull();
    expect(screen.getByText(/第 1 空/)).toBeDefined();
  });

  it("updates the primary answer via the cloze group input", () => {
    const onChange = vi.fn();
    render(
      <FillForm
        value={{ type: "fill", answers: ["old"] }}
        onChange={onChange}
        question="Capital: {{c1::France}}"
        onQuestionChange={() => {}}
      />
    );
    const input = screen.getByLabelText("第 1 空答案") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "new" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].answers[0]).toBe("new");
  });
});
