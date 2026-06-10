import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CardTypeSegmented } from "./card-type-segmented";

afterEach(() => {
  cleanup();
});

describe("CardTypeSegmented (stacked)", () => {
  it("renders 5 cells with Chinese labels", () => {
    const onChange = vi.fn();
    render(<CardTypeSegmented value={null} onChange={onChange} />);
    expect(
      screen.getByRole("button", { name: "选择选择题" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "选择多选题" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "选择填空题" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "选择问答题" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "选择判断题" })
    ).toBeTruthy();
  });

  it("calls onChange with the picked type", () => {
    const onChange = vi.fn();
    render(<CardTypeSegmented value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "选择填空题" }));
    expect(onChange).toHaveBeenCalledWith("fill");
  });

  it("marks the active cell with aria-pressed=true", () => {
    const onChange = vi.fn();
    render(<CardTypeSegmented value="qa" onChange={onChange} />);
    const qaBtn = screen.getByRole("button", { name: "选择问答题" });
    expect(qaBtn.getAttribute("aria-pressed")).toBe("true");
    const choiceBtn = screen.getByRole("button", { name: "选择选择题" });
    expect(choiceBtn.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("CardTypeSegmented (inline)", () => {
  it("renders as a radiogroup", () => {
    const onChange = vi.fn();
    render(
      <CardTypeSegmented
        value="qa"
        onChange={onChange}
        layout="inline"
      />
    );
    const group = screen.getByRole("radiogroup", { name: "题型" });
    expect(group).toBeTruthy();
  });

  it("marks the active cell with aria-checked", () => {
    const onChange = vi.fn();
    render(
      <CardTypeSegmented
        value="fill"
        onChange={onChange}
        layout="inline"
      />
    );
    const fillBtn = screen.getByRole("radio", { name: "填空题" });
    expect(fillBtn.getAttribute("aria-checked")).toBe("true");
    const choiceBtn = screen.getByRole("radio", { name: "选择题" });
    expect(choiceBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("calls onChange when a different cell is clicked", () => {
    const onChange = vi.fn();
    render(
      <CardTypeSegmented
        value="qa"
        onChange={onChange}
        layout="inline"
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: "判断题" }));
    expect(onChange).toHaveBeenCalledWith("judge");
  });
});
