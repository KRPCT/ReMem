import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChoiceForm } from "./choice-form";

afterEach(() => {
  cleanup();
});

describe("ChoiceForm (CARD-04)", () => {
  it("disables the × 删除 button when options.length === 2", () => {
    const onChange = vi.fn();
    render(
      <ChoiceForm
        value={{
          type: "choice",
          options: ["A", "B"],
          answer: 0,
          shuffle: true,
          pinLastOption: false,
        }}
        onChange={onChange}
      />
    );
    const deletes = screen.getAllByRole("button", { name: /删除/ });
    expect(deletes).toHaveLength(2);
    for (const b of deletes) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("enables the × 删除 button when options.length > 2", () => {
    const onChange = vi.fn();
    render(
      <ChoiceForm
        value={{
          type: "choice",
          options: ["A", "B", "C"],
          answer: 0,
          shuffle: true,
          pinLastOption: false,
        }}
        onChange={onChange}
      />
    );
    const deletes = screen.getAllByRole("button", { name: /删除/ });
    expect(deletes).toHaveLength(3);
    for (const b of deletes) {
      expect((b as HTMLButtonElement).disabled).toBe(false);
    }
  });
});
