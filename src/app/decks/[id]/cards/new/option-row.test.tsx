import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OptionRow } from "./option-row";

afterEach(() => {
  cleanup();
});

describe("OptionRow", () => {
  it("renders the input with the value and a remove button", () => {
    const onValueChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <OptionRow
        index={0}
        value="hello"
        onValueChange={onValueChange}
        onRemove={onRemove}
        canRemove
        control={<span data-testid="control" />}
        ariaLabel="选项 1"
        removeAriaLabel="删除选项 1"
      />
    );
    expect(screen.getByDisplayValue("hello")).toBeTruthy();
    expect(screen.getByLabelText("删除选项 1")).toBeTruthy();
    expect(screen.getByTestId("control")).toBeTruthy();
  });

  it("calls onValueChange when the input changes", () => {
    const onValueChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <OptionRow
        index={0}
        value=""
        onValueChange={onValueChange}
        onRemove={onRemove}
        canRemove
        control={null}
        ariaLabel="选项 1"
        removeAriaLabel="删除选项 1"
      />
    );
    fireEvent.change(screen.getByLabelText("选项 1"), {
      target: { value: "world" },
    });
    expect(onValueChange).toHaveBeenCalledWith("world");
  });

  it("calls onRemove when the remove button is clicked", () => {
    const onValueChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <OptionRow
        index={2}
        value="x"
        onValueChange={onValueChange}
        onRemove={onRemove}
        canRemove
        control={null}
        ariaLabel="选项 3"
        removeAriaLabel="删除选项 3"
      />
    );
    fireEvent.click(screen.getByLabelText("删除选项 3"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("disables the remove button when canRemove is false", () => {
    const onValueChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <OptionRow
        index={0}
        value=""
        onValueChange={onValueChange}
        onRemove={onRemove}
        canRemove={false}
        control={null}
        ariaLabel="选项 1"
        removeAriaLabel="删除选项 1"
      />
    );
    const btn = screen.getByLabelText("删除选项 1") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows a ref-menu button when allOptionLabels is provided and inserts {{#N}} on click", async () => {
    const onValueChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <OptionRow
        index={0}
        value=""
        onValueChange={onValueChange}
        onRemove={onRemove}
        canRemove
        control={null}
        ariaLabel="选项 1"
        removeAriaLabel="删除选项 1"
        allOptionLabels={["alpha", "beta"]}
      />
    );
    const trigger = screen.getByRole("button", { name: "插入选项引用" });
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);
    const menuItem = await screen.findByRole("menuitem", { name: /beta/ });
    fireEvent.click(menuItem);
    expect(onValueChange).toHaveBeenCalledWith("{{#2}}");
  });

  it("renders the '已置底' label on the pinned last row", () => {
    render(
      <OptionRow
        index={1}
        value="last"
        onValueChange={() => {}}
        onRemove={() => {}}
        canRemove
        control={null}
        ariaLabel="选项 2"
        removeAriaLabel="删除选项 2"
        isLast
        pinLastOption
        onPinLastChange={() => {}}
      />
    );
    expect(screen.getByText("已置底")).toBeTruthy();
  });

  it("renders the '末尾' label on the unpinned last row", () => {
    render(
      <OptionRow
        index={1}
        value="last"
        onValueChange={() => {}}
        onRemove={() => {}}
        canRemove
        control={null}
        ariaLabel="选项 2"
        removeAriaLabel="删除选项 2"
        isLast
        pinLastOption={false}
        onPinLastChange={() => {}}
      />
    );
    expect(screen.getByText("末尾")).toBeTruthy();
  });
});
