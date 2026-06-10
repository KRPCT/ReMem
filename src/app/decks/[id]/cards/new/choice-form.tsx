"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OptionRow } from "./option-row";

export type ChoiceFormValue = {
  type: "choice";
  options: string[];
  answer: number;
  shuffle: boolean;
  pinLastOption: boolean;
};

export interface ChoiceFormProps {
  value: ChoiceFormValue;
  onChange: (v: ChoiceFormValue) => void;
  fieldErrors?: Record<string, string>;
}

const MIN_OPTIONS = 2;

function ChoiceFormImpl({ value, onChange, fieldErrors }: ChoiceFormProps) {
  return (
    <div className="space-y-m">
      <Label>选项 (≥ {MIN_OPTIONS})</Label>
      {value.options.map((opt, i) => {
        const isLast = i === value.options.length - 1;
        return (
          <OptionRow
            key={i}
            index={i}
            value={opt}
            onValueChange={(v) => {
              const next = value.options.slice();
              next[i] = v;
              onChange({ ...value, options: next });
            }}
            onRemove={() => {
              const next = value.options.filter((_, j) => j !== i);
              const newAnswer = value.answer >= next.length ? 0 : value.answer;
              // If the user deletes the row that was pinned, drop the flag.
              const stillPinned = value.pinLastOption && !isLast;
              onChange({
                ...value,
                options: next,
                answer: newAnswer,
                pinLastOption: stillPinned,
              });
            }}
            canRemove={value.options.length > MIN_OPTIONS}
            ariaLabel={`选项 ${i + 1}`}
            removeAriaLabel={`删除选项 ${i + 1}`}
            isLast={isLast}
            pinLastOption={value.pinLastOption}
            onPinLastChange={(v) =>
              onChange({ ...value, pinLastOption: v })
            }
            allOptionLabels={value.options}
            control={
              <input
                type="radio"
                name="answer"
                checked={value.answer === i}
                onChange={() => onChange({ ...value, answer: i })}
                className="h-4 w-4 shrink-0 rounded-sm"
                aria-label={`选择第 ${i + 1} 个选项作为答案`}
              />
            }
          />
        );
      })}
      {fieldErrors?.answer ? (
        <p className="text-xs text-destructive" role="alert">
          {fieldErrors.answer}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({ ...value, options: [...value.options, ""] })
        }
      >
        + 新增选项
      </Button>
    </div>
  );
}

export const ChoiceForm = memo(ChoiceFormImpl);
