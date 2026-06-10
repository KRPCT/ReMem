import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import { MarkdownEditor } from "./markdown-editor";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    value: 1280,
    configurable: true,
    writable: true,
  });
});

// jsdom does not auto-cleanup between vitest tests in this repo's
// config (no setup file with @testing-library/react cleanup). Wire it
// up manually so each test starts with an empty DOM.
afterEach(() => {
  cleanup();
});

describe("MarkdownEditor (textarea + preview)", () => {
  it("EDIT-01: renders the editor and wires onChange", () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        value=""
        onChange={onChange}
        ariaLabel="markdown editor"
      />
    );
    const ta = screen.getByLabelText("markdown editor") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "hello **world**" } });
    expect(onChange).toHaveBeenCalledWith("hello **world**");
  });

  it("EDIT-02: renders the preview pane alongside the editor", () => {
    const { container } = render(
      <MarkdownEditor value="# heading" onChange={() => {}} />
    );
    // Preview pane carries aria-label="预览"; assert it's in the DOM.
    expect(container.querySelector('[aria-label="预览"]')).not.toBeNull();
  });

  it("EDIT-03: surfaces image upload via toolbar trigger", async () => {
    const upload = vi.fn().mockResolvedValue("/uploads/test.png");
    render(
      <MarkdownEditor
        value=""
        onChange={() => {}}
        enableImageUpload
        onImageUpload={upload}
        ariaLabel="ed"
      />
    );
    const btn = screen.getByRole("button", { name: "插入图片" });
    expect(btn).toBeTruthy();
  });

  it("EDIT-04: wraps the selection on bold click", () => {
    const calls: string[] = [];
    function Harness() {
      return (
        <MarkdownEditor
          value="abc"
          onChange={(v) => calls.push(v)}
          ariaLabel="md"
        />
      );
    }
    render(<Harness />);
    const ta = screen.getByLabelText("md") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 3);
    fireEvent.click(screen.getByRole("button", { name: "加粗" }));
    expect(calls.at(-1)).toBe("**abc**");
  });
});
