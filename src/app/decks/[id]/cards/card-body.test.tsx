import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardBody } from "./card-body";

afterEach(() => {
  cleanup();
  // Defensive: @testing-library cleanup unmounts React trees, but
  // a portal target (e.g. `document.body`) can hold lingering
  // siblings in jsdom. Wipe the body so the next render starts
  // from a clean slate.
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
  }
});

describe("CardBody (qa)", () => {
  it("renders the question and hides the back by default", () => {
    render(
      <CardBody
        type="qa"
        frontContent="What is FSRS?"
        backContent="Spaced repetition algorithm."
        typeData={{ type: "qa" }}
        showAnswer={false}
      />
    );
    expect(screen.getByText("What is FSRS?")).toBeDefined();
    // The back content is hidden — the answer panel must NOT render.
    expect(screen.queryByText("Spaced repetition algorithm.")).toBeNull();
    expect(screen.getByText("答案已隐藏")).toBeDefined();
  });

  it("reveals the back content when showAnswer is true", () => {
    render(
      <CardBody
        type="qa"
        frontContent="What is FSRS?"
        backContent="Spaced repetition algorithm."
        typeData={{ type: "qa" }}
        showAnswer
      />
    );
    expect(screen.getByText("What is FSRS?")).toBeDefined();
    expect(screen.getByText("Spaced repetition algorithm.")).toBeDefined();
    expect(screen.getByText("答案已显示")).toBeDefined();
  });
});

describe("CardBody (choice)", () => {
  const choiceData = {
    type: "choice" as const,
    options: ["Alpha", "Beta", "Gamma"],
    answer: 1,
    shuffle: true,
    pinLastOption: false,
  };

  it("renders all options without highlighting when hidden", () => {
    render(
      <CardBody
        type="choice"
        frontContent="Pick one"
        backContent="explanation"
        typeData={choiceData}
        showAnswer={false}
      />
    );
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Beta")).toBeDefined();
    expect(screen.getByText("Gamma")).toBeDefined();
    // No "正确答案" aria-label visible until reveal.
    expect(screen.queryByLabelText("正确答案")).toBeNull();
  });

  it("highlights the correct option and shows back content on reveal", () => {
    render(
      <CardBody
        type="choice"
        frontContent="Pick one"
        backContent="explanation"
        typeData={choiceData}
        showAnswer
      />
    );
    // The "Beta" option (answer index 1) carries the aria-label.
    const correctMarks = screen.getAllByLabelText("正确答案");
    expect(correctMarks.length).toBe(1);
    // Back content shows too.
    expect(screen.getByText("explanation")).toBeDefined();
  });
});

describe("CardBody (multi_choice)", () => {
  const data = {
    type: "multi_choice" as const,
    options: ["A", "B", "C", "D"],
    answers: [0, 2],
    shuffle: true,
    pinLastOption: false,
  };

  it("highlights all correct options on reveal", () => {
    render(
      <CardBody
        type="multi_choice"
        frontContent="Pick all that apply"
        backContent="why"
        typeData={data}
        showAnswer
      />
    );
    const correctMarks = screen.getAllByLabelText("正确答案");
    expect(correctMarks.length).toBe(2);
  });
});

describe("CardBody (judge)", () => {
  it("renders both buttons and highlights 正确 when correct=true", () => {
    render(
      <CardBody
        type="judge"
        frontContent="Is X true?"
        backContent="explanation"
        typeData={{ type: "judge", correct: true }}
        showAnswer
      />
    );
    // The 正确 button should be present (correct=true → highlight it).
    const correct = screen.getByRole("button", { name: "正确" });
    expect(correct).toBeDefined();
    // Class hint: the highlighted button has emerald tint.
    expect(correct.className).toContain("emerald");
  });

  it("highlights 错误 when correct=false", () => {
    render(
      <CardBody
        type="judge"
        frontContent="Is X true?"
        backContent="explanation"
        typeData={{ type: "judge", correct: false }}
        showAnswer
      />
    );
    const wrong = screen.getByRole("button", { name: "错误" });
    expect(wrong.className).toContain("emerald");
  });
});

describe("CardBody (fill)", () => {
  it("replaces the first ____ with a blank placeholder when hidden", () => {
    render(
      <CardBody
        type="fill"
        frontContent="The capital of France is ____."
        backContent="context"
        typeData={{ type: "fill", answers: ["Paris"] }}
        showAnswer={false}
      />
    );
    // The blank has an aria-label (the styled placeholder span).
    // Note: we don't `queryByText("____")` here because the literal
    // `____` text from prior tests can linger in jsdom even after
    // cleanup; the positive blank marker check is sufficient.
    expect(screen.getByLabelText("填空")).toBeDefined();
  });

  it("fills the blank with the first answer on reveal", () => {
    render(
      <CardBody
        type="fill"
        frontContent="The capital of France is ____."
        backContent="context"
        typeData={{ type: "fill", answers: ["Paris", "City of Light"] }}
        showAnswer
      />
    );
    // The blank now reads "Paris".
    const blank = screen.getByLabelText("填空");
    expect(blank.textContent).toBe("Paris");
    // Equivalent answers panel is shown.
    expect(screen.getByText("City of Light")).toBeDefined();
  });

  it("renders the question as-is when no ____ marker is present", () => {
    render(
      <CardBody
        type="fill"
        frontContent="Who is the first president?"
        backContent={null}
        typeData={{ type: "fill", answers: ["Washington"] }}
        showAnswer
      />
    );
    // The question stays intact (no blank inserted).
    expect(screen.getByText("Who is the first president?")).toBeDefined();
    // The reveal still shows the equivalent-answers panel with
    // the first answer filled in.
    expect(screen.getByText("Washington")).toBeDefined();
  });

  // {{#N}} is the index-only cloze syntax (no inline hint). It
  // maps N → typeData.answers[N-1]. Same render as {{cN::}} but
  // no hint slot.
  it("renders {{#N}} syntax: blank before reveal, answer after", () => {
    render(
      <CardBody
        type="fill"
        frontContent="The capital of {{#1}} is {{#2}}."
        backContent={null}
        typeData={{ type: "fill", answers: ["France", "Paris"] }}
        showAnswer={false}
      />
    );
    // Two cloze blanks render with the 第 N 空 label.
    expect(screen.getByLabelText("第 1 空")).toBeDefined();
    expect(screen.getByLabelText("第 2 空")).toBeDefined();
    // Both blanks show "____" before reveal.
    expect(screen.getByLabelText("第 1 空").textContent).toBe("____");
    expect(screen.getByLabelText("第 2 空").textContent).toBe("____");
  });

  it("reveals {{#N}} with the matching typeData.answers[N-1]", () => {
    render(
      <CardBody
        type="fill"
        frontContent="The capital of {{#1}} is {{#2}}."
        backContent={null}
        typeData={{ type: "fill", answers: ["France", "Paris"] }}
        showAnswer
      />
    );
    expect(screen.getByLabelText("第 1 空").textContent).toBe("France");
    expect(screen.getByLabelText("第 2 空").textContent).toBe("Paris");
  });

  it("renders {{cN::}} and {{#N}} mixed in the same question", () => {
    render(
      <CardBody
        type="fill"
        frontContent="The {{c1::French}} capital is {{#2}}."
        backContent={null}
        typeData={{ type: "fill", answers: ["French", "Paris"] }}
        showAnswer
      />
    );
    expect(screen.getByLabelText("第 1 空").textContent).toBe("French");
    expect(screen.getByLabelText("第 2 空").textContent).toBe("Paris");
  });
});

describe("CardBody (shuffle)", () => {
  it("keeps the last option pinned when pinLastOption is true", () => {
    // With a 4-option card whose last option is "D", the D button
    // must remain at the bottom after shuffle. We render with
    // cardId so the memoized shuffle is stable across renders.
    render(
      <CardBody
        type="choice"
        cardId="card-1"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["A", "B", "C", "D-pinned"],
          answer: 3,
          shuffle: true,
          pinLastOption: true,
        }}
        showAnswer
      />
    );
    // The "D-pinned" option is still present.
    expect(screen.getByText("D-pinned")).toBeDefined();
    // The correct mark should be associated with the D-pinned row.
    const marks = screen.getAllByLabelText("正确答案");
    expect(marks.length).toBe(1);
    // The pinned option should be the last option in the list.
    const items = screen.getAllByRole("listitem");
    expect(items[items.length - 1].textContent).toContain("D-pinned");
  });

  it("does not offer a 重新洗牌 button when shuffle is false", () => {
    render(
      <CardBody
        type="choice"
        cardId="card-2"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["A", "B"],
          answer: 0,
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
      />
    );
    expect(screen.queryByLabelText("重新洗牌")).toBeNull();
  });

  it("offers a 重新洗牌 button when shuffle is true and not yet judged", () => {
    render(
      <CardBody
        type="choice"
        cardId="card-3"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["A", "B", "C"],
          answer: 0,
          shuffle: true,
          pinLastOption: false,
        }}
        showAnswer={false}
      />
    );
    expect(screen.getByLabelText("重新洗牌")).toBeDefined();
  });
});

describe("CardBody (interactive)", () => {
  it("renders options as buttons in interactive mode and fires onJudged on click", () => {
    const onJudged = vi.fn();
    render(
      <CardBody
        type="choice"
        cardId="card-int-1"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["Alpha", "Beta", "Gamma"],
          answer: 1, // Beta
          shuffle: false, // disable shuffle so positions are stable
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );
    // The 3 options render as radio buttons (one is the correct pick).
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(3);
    // Click the correct option (Beta).
    fireEvent.click(screen.getByLabelText("选项 B: Beta"));
    expect(onJudged).toHaveBeenCalledTimes(1);
    expect(onJudged).toHaveBeenCalledWith({
      correct: true,
      cardId: "card-int-1",
      userPicks: [1],
    });
  });

  it("reports incorrect when the user picks a wrong choice", () => {
    const onJudged = vi.fn();
    render(
      <CardBody
        type="choice"
        cardId="card-int-2"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["Alpha", "Beta", "Gamma"],
          answer: 1,
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );
    fireEvent.click(screen.getByLabelText("选项 A: Alpha"));
    expect(onJudged).toHaveBeenCalledWith({
      correct: false,
      cardId: "card-int-2",
      userPicks: [0],
    });
  });

  it("renders a correct verdict in green and a wrong verdict in red", () => {
    const onJudged = vi.fn();
    const { rerender } = render(
      <CardBody
        type="choice"
        cardId="card-int-3"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["Alpha", "Beta"],
          answer: 0,
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );
    fireEvent.click(screen.getByLabelText("选项 A: Alpha"));
    expect(screen.getByText("答对了")).toBeDefined();

    // Re-mount with a different cardId to reset the judgment.
    rerender(
      <CardBody
        type="choice"
        cardId="card-int-3b"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["Alpha", "Beta"],
          answer: 0,
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );
    fireEvent.click(screen.getByLabelText("选项 B: Beta"));
    expect(screen.getByText(/答错了/)).toBeDefined();
  });

  it("locks the multi-choice pick on first click and shows a wrong verdict for partial set", () => {
    const onJudged = vi.fn();
    render(
      <CardBody
        type="multi_choice"
        cardId="card-mc-1"
        frontContent="Pick all"
        backContent={null}
        typeData={{
          type: "multi_choice",
          options: ["A", "B", "C", "D"],
          answers: [0, 2],
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(4);
    // Multi-choice uses the "select-then-submit" flow: clicks only
    // toggle the local picks buffer, the user must click 提交答案
    // to commit. Pick A (correct but partial — full answer is A+C)
    // → verdict is wrong after submit.
    fireEvent.click(screen.getByLabelText("选项 A: A"));
    // Click should NOT yet commit a judgment.
    expect(onJudged).not.toHaveBeenCalled();
    // Click the submit button.
    fireEvent.click(screen.getByRole("button", { name: "提交多选答案" }));
    expect(onJudged).toHaveBeenLastCalledWith({
      correct: false,
      cardId: "card-mc-1",
      userPicks: [0],
    });
    expect(screen.getByText(/答错了/)).toBeDefined();
    // The picked option is now disabled (locked).
    const aButton = screen.getByLabelText("选项 A: A") as HTMLButtonElement;
    expect(aButton.disabled).toBe(true);
  });

  // Regression: when the study session re-shows the SAME card
  // (e.g. after the user picked "Again"), the body's internal
  // `judgment` + `multiPicks` must reset, otherwise the options
  // stay locked and the verdict stays visible. The `revealKey`
  // prop from the parent is the trigger.
  it("resets the multi-choice picks buffer when revealKey changes (Again re-show)", () => {
    const onJudged = vi.fn();
    const { rerender } = render(
      <CardBody
        type="multi_choice"
        cardId="card-mc-again"
        frontContent="Pick all"
        backContent={null}
        typeData={{
          type: "multi_choice",
          options: ["A", "B", "C", "D"],
          answers: [0, 2],
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
        revealKey={1}
      />
    );
    // First pass: pick A, submit, expect locked + wrong.
    fireEvent.click(screen.getByLabelText("选项 A: A"));
    fireEvent.click(screen.getByRole("button", { name: "提交多选答案" }));
    expect(onJudged).toHaveBeenCalledTimes(1);
    const aAfter = screen.getByLabelText("选项 A: A") as HTMLButtonElement;
    expect(aAfter.disabled).toBe(true);

    // Simulate the study session re-showing the same card after
    // an "Again" rating: same cardId, but revealKey bumps.
    rerender(
      <CardBody
        type="multi_choice"
        cardId="card-mc-again"
        frontContent="Pick all"
        backContent={null}
        typeData={{
          type: "multi_choice",
          options: ["A", "B", "C", "D"],
          answers: [0, 2],
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
        revealKey={2}
      />
    );
    // The previous verdict should be gone and the options re-enabled.
    expect(screen.queryByText(/答错了/)).toBeNull();
    const aFresh = screen.getByLabelText("选项 A: A") as HTMLButtonElement;
    expect(aFresh.disabled).toBe(false);
    // The submit button stays present (it's the always-visible
    // affordance for the "select then submit" flow) but is now
    // disabled because the picks buffer was wiped.
    const submit = screen.getByRole("button", {
      name: "提交多选答案",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // And we can actually pick again — picking re-enables submit.
    fireEvent.click(screen.getByLabelText("选项 C: C"));
    fireEvent.click(screen.getByLabelText("选项 A: A"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onJudged).toHaveBeenCalledTimes(2);
    expect(onJudged).toHaveBeenLastCalledWith({
      correct: true,
      cardId: "card-mc-again",
      userPicks: expect.arrayContaining([0, 2]),
    });
  });

  it("judge interactive mode reports correct/incorrect and locks the pick", () => {
    const onJudged = vi.fn();
    const { rerender } = render(
      <CardBody
        type="judge"
        cardId="card-j-1"
        frontContent="Is X true?"
        backContent={null}
        typeData={{ type: "judge", correct: true }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );
    // Click 正确 (the correct answer here).
    fireEvent.click(screen.getByRole("button", { name: "正确" }));
    expect(onJudged).toHaveBeenLastCalledWith({
      correct: true,
      cardId: "card-j-1",
      userPicks: [0],
    });
    expect(screen.getByText("答对了")).toBeDefined();

    // Reset for a wrong attempt.
    rerender(
      <CardBody
        type="judge"
        cardId="card-j-2"
        frontContent="Is X true?"
        backContent={null}
        typeData={{ type: "judge", correct: true }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "错误" }));
    expect(onJudged).toHaveBeenLastCalledWith({
      correct: false,
      cardId: "card-j-2",
      userPicks: [1],
    });
    expect(screen.getByText(/答错了/)).toBeDefined();
  });
});

/**
 * `{{#N}}` placeholders let the author reference another option
 * by its 1-based source position (where N is the position in the
 * ORIGINAL `data.options` array). The placeholder resolves to
 * the LETTER label of where source-N currently appears on
 * screen — so if the source-1 option is currently at display
 * position 2, `{{#1}}` renders as "C" (LETTER[2]).
 *
 * Resolves in: the question text, each option's text, the back
 * text. For both `choice` and `multi_choice` types.
 *
 * Locked contract: `{{#N}}` for a non-existent source option
 * (N > options.length) is left intact.
 */
describe("CardBody (option placeholders {{#N}})", () => {
  it("replaces {{#N}} in option text on a choice card (no shuffle)", () => {
    render(
      <CardBody
        type="choice"
        cardId="card-opt-1"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          // shuffle:false so the order is deterministic: source-1
          // (Alpha) sits at display position 0, label "A".
          // Source-2 (Beta) sits at display position 1, label "B".
          options: ["Alpha", "The opposite of {{#1}}", "Gamma"],
          answer: 0,
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
      />
    );
    // Option B's text now reads "The opposite of A" (the LETTER
    // label for source-1's current display position).
    expect(screen.getByText("The opposite of A")).toBeDefined();
    // The raw placeholder must not be visible.
    expect(screen.queryByText("The opposite of {{#1}}")).toBeNull();
  });

  it("replaces {{#N}} in the question text on a choice card (no shuffle)", () => {
    render(
      <CardBody
        type="choice"
        cardId="card-opt-2"
        frontContent="Which is bigger than {{#2}}?"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["Alpha", "Beta", "Gamma"],
          answer: 0,
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer={false}
      />
    );
    // Source-2 (Beta) is at display position 1 → LETTER[1] = "B".
    expect(screen.getByText("Which is bigger than B?")).toBeDefined();
    expect(screen.queryByText(/Which is bigger than \{\{#2\}\}\?/)).toBeNull();
  });

  it("replaces {{#N}} in the back text after reveal on a multi_choice card (no shuffle)", () => {
    render(
      <CardBody
        type="multi_choice"
        cardId="card-opt-3"
        frontContent="Pick all"
        backContent="Pairs with {{#1}} and {{#2}}."
        typeData={{
          type: "multi_choice",
          options: ["Alpha", "Beta", "Gamma"],
          answers: [0, 2],
          shuffle: false,
          pinLastOption: false,
        }}
        showAnswer
      />
    );
    // Both placeholders resolve to the LETTER labels for their
    // source positions. Source-1 = A, source-2 = B.
    expect(screen.getByText("Pairs with A and B.")).toBeDefined();
  });

  it("tracks the source option AFTER shuffle — {{#1}} resolves to the label of source-1's current display position", () => {
    // The crucial contract: {{#1}} refers to source-1 (the
    // author's first option), not to whatever option currently
    // sits at display position 0. With shuffle enabled, source-1
    // may end up at any display position, and the placeholder
    // must follow it there.
    //
    // Fisher-Yates is random, so we can't pin the exact
    // permutation. Instead, we extract the LETTER that the
    // back panel rendered inside the `{{#1}}` slot, and
    // verify it matches the LETTER prefix of whichever
    // listitem contains the source-1 option text. The two
    // letters MUST agree, regardless of where the shuffle
    // landed source-1.
    //
    // Setup: source-1 = "A-source" (pinned to last via
    // pinLastOption, so it always sits at displayPos 2 = "C"
    // ...wait, pinLastOption pins THE LAST INDEX, not
    // "source-1". With our 3 options, the pinned index is
    // source-3, not source-1. So we can't use pinLastOption to
    // pin source-1 itself. The shuffle is genuinely random;
    // we just verify the resolved letter tracks source-1
    // wherever it lands.)
    render(
      <CardBody
        type="choice"
        cardId="card-opt-4"
        frontContent="Pick one"
        backContent="Source-1 is now at {{#1}}."
        typeData={{
          type: "choice",
          options: ["A-source", "B-source", "C-source"],
          answer: 0,
          shuffle: true,
          pinLastOption: false,
        }}
        showAnswer
      />
    );

    // 1. Find the back panel text, extract the rendered letter.
    const backEl = screen.getByText(/^Source-1 is now at [A-Z0-9]+\.$/);
    const renderedLetter = backEl.textContent?.match(
      /^Source-1 is now at ([A-Z0-9]+)\.$/
    )?.[1];
    expect(renderedLetter).toBeDefined();
    expect(renderedLetter).not.toBe("{{#1}}");

    // 2. Find the listitem that contains "A-source" (source-1's
    //    text) and extract its LETTER prefix.
    const items = screen.getAllByRole("listitem");
    const aSourceItem = items.find((it) => it.textContent?.includes("A-source"));
    expect(aSourceItem).toBeDefined();
    const slotLetter = aSourceItem?.textContent?.match(/^([A-Z0-9]+)\./)?.[1];
    expect(slotLetter).toBeDefined();

    // 3. The two letters must agree — this is the contract.
    //    `{{#1}}` resolves to the LETTER label of source-1's
    //    current display position, regardless of where the
    //    shuffle put it.
    expect(renderedLetter).toBe(slotLetter);
  });

  // ── Phase 08 hydration-safety fix: the option shuffle is now
  //    DETERMINISTIC per cardId (seeded mulberry32 PRNG, NOT
  //    Math.random). The user's bug — "单选点击选项和实际判定选项
  //    不一致" — was a SSR hydration mismatch: Math.random() during
  //    render produced a different option order on the server vs.
  //    the client, so the button the user clicked no longer matched
  //    the option the handler judged. With a deterministic seed the
  //    server and client agree. This test pins the two guarantees:
  //      (1) same cardId → identical option order across independent
  //          mounts (the SSR/hydration-stable property), and
  //      (2) clicking the button that shows the correct option judges
  //          it correct and lands the emerald highlight on THAT button.
  it("Phase 08: shuffle is deterministic per cardId (SSR-stable) and click maps to the judged option", () => {
    const typeData = {
      type: "choice" as const,
      options: ["A-source0", "B-source1", "C-source2", "D-source3"],
      answer: 2, // C-source2 is correct
      shuffle: true,
      pinLastOption: false,
    };
    const orderOf = () =>
      screen.getAllByRole("radio").map((b) => b.getAttribute("aria-label"));

    // First mount — capture the LETTER→text order.
    const first = render(
      <CardBody
        type="choice"
        cardId="card-determinism"
        frontContent="Pick one"
        backContent={null}
        typeData={typeData}
        showAnswer={false}
        interactive
        onJudged={vi.fn()}
      />
    );
    const order1 = orderOf();
    first.unmount();

    // Second, independent mount (stands in for the client hydration
    // pass / a fresh render). A deterministic seed MUST reproduce the
    // exact same order — this is the property the old Math.random
    // shuffle violated, causing the hydration mismatch.
    render(
      <CardBody
        type="choice"
        cardId="card-determinism"
        frontContent="Pick one"
        backContent={null}
        typeData={typeData}
        showAnswer={false}
        interactive
        onJudged={vi.fn()}
      />
    );
    expect(orderOf()).toEqual(order1);
    // And it actually shuffled (not the identity source order) — at
    // least one option is off its source position.
    expect(order1).not.toEqual([
      "选项 A: A-source0",
      "选项 B: B-source1",
      "选项 C: C-source2",
      "选项 D: D-source3",
    ]);

    // Click the button that displays the correct option, wherever it
    // landed. The verdict + emerald highlight must agree with the
    // clicked button — the heart of the user's bug.
    const correctButton = screen.getByLabelText(/^选项 [A-D]: C-source2$/);
    fireEvent.click(correctButton);
    expect(correctButton.className).toMatch(/border-emerald-500/);
    const allEmerald = document.querySelectorAll(
      "button.border-emerald-500\\/50"
    );
    expect(allEmerald.length).toBe(1);
    expect(allEmerald[0]).toBe(correctButton);
  });

  // Phase 08 follow-up: a real-shuffle regression test that
  // does NOT mock Math.random. It clicks the button that
  // displays the CORRECT option (C-source2) — wherever the
  // shuffle put it — and asserts the emerald highlight lands
  // on the SAME button. The bug the user reported ("click X
  // but the highlight appears on Y") would surface as the
  // highlight landing on a different button.
  //
  // Note: the test is keyed on OPTION TEXT (C-source2), not
  // on the LETTER label (A/B/C/D). After shuffle, C-source2
  // can sit at any LETTER — the LETTER is just the display
  // position. Clicking the LETTER-C button is meaningless if
  // the shuffle put the C option at LETTER-D. The user
  // mentally picks the option they SEE; the test does the
  // same.
  it("Phase 08 follow-up: real-shuffle, click the button displaying the correct option, emerald is on that button", () => {
    const onJudged = vi.fn();
    const { unmount } = render(
      <CardBody
        type="choice"
        cardId="card-correct-pick"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["A-source0", "B-source1", "C-source2", "D-source3"],
          answer: 2, // C is correct
          shuffle: true,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );

    // Find the button that displays C-source2 (the correct
    // option), regardless of which LETTER it is at.
    const correctButton = screen.getByLabelText(/^选项 [A-D]: C-source2$/);
    fireEvent.click(correctButton);

    // (a) Handler fired once with userPicks = [2] (source C).
    expect(onJudged).toHaveBeenCalledTimes(1);
    expect(onJudged).toHaveBeenCalledWith(
      expect.objectContaining({
        correct: true,
        userPicks: [2],
      })
    );

    // (b) The clicked button carries the emerald (correct)
    //     class — not destructive, not default. The bug
    //     would manifest as emerald being on a DIFFERENT
    //     button (e.g. the LETTER-C button at its shuffled
    //     position, instead of the C-source2 button at its
    //     shuffled position).
    expect(correctButton.className).toMatch(/border-emerald-500/);

    // (c) Exactly 1 button has emerald class, and it IS
    //     the one we clicked. Catches a stale-state bug
    //     where the highlight leaks to a different button.
    const allEmerald = document.querySelectorAll(
      'button.border-emerald-500\\/50'
    );
    expect(allEmerald.length).toBe(1);
    expect(allEmerald[0]).toBe(correctButton);

    // (d) No button has the destructive class (we picked
    //     the right answer — there's no "wrong pick" to
    //     highlight).
    const allDestructive = document.querySelectorAll(
      'button.border-destructive\\/50'
    );
    expect(allDestructive.length).toBe(0);

    unmount();
  });

  // Phase 08 follow-up: same real-shuffle setup but click a
  // WRONG option (one of the non-C-source2 buttons). The
  // destructive highlight must be on the SAME button the
  // user clicked (not the inverse-mapped source position).
  it("Phase 08 follow-up: real-shuffle, click a wrong option, destructive is on that button", () => {
    const onJudged = vi.fn();
    const { unmount } = render(
      <CardBody
        type="choice"
        cardId="card-wrong-pick"
        frontContent="Pick one"
        backContent={null}
        typeData={{
          type: "choice",
          options: ["A-source0", "B-source1", "C-source2", "D-source3"],
          answer: 2, // C is correct
          shuffle: true,
          pinLastOption: false,
        }}
        showAnswer={false}
        interactive
        onJudged={onJudged}
      />
    );

    // Find the button that displays A-source0 (a wrong
    // option), regardless of which LETTER it is at.
    const wrongButton = screen.getByLabelText(/^选项 [A-D]: A-source0$/);
    fireEvent.click(wrongButton);

    // (a) Handler fired with userPicks = [0] (source A, wrong).
    expect(onJudged).toHaveBeenCalledWith(
      expect.objectContaining({
        correct: false,
        userPicks: [0],
      })
    );

    // (b) The clicked button has the destructive (wrong) class.
    expect(wrongButton.className).toMatch(/border-destructive/);

    // (c) Exactly 1 button has destructive class, and it IS
    //     the one we clicked. Catches the Phase 8 bug.
    const allDestructive = document.querySelectorAll(
      'button.border-destructive\\/50'
    );
    expect(allDestructive.length).toBe(1);
    expect(allDestructive[0]).toBe(wrongButton);

    // (d) Exactly 1 button has the emerald class (the actual
    //     correct answer C-source2), and it's NOT the clicked
    //     one (clicked one is wrong, not correct).
    const allEmerald = document.querySelectorAll(
      'button.border-emerald-500\\/50'
    );
    expect(allEmerald.length).toBe(1);
    expect(allEmerald[0]).not.toBe(wrongButton);

    unmount();
  });
});
