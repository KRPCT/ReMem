"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OptionRow } from "./option-row";

export type MultiChoiceFormValue = {
  type: "multi_choice";
  options: string[];
  answers: number[];
  shuffle: boolean;
  pinLastOption: boolean;
};

export interface MultiChoiceFormProps {
  value: MultiChoiceFormValue;
  onChange: (v: MultiChoiceFormValue) => void;
  fieldErrors?: Record<string, string>;
}

const MIN_OPTIONS = 2;

function MultiChoiceFormImpl({
  value,
  onChange,
  fieldErrors,
}: MultiChoiceFormProps) {
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
              const nextOptions = value.options.filter((_, j) => j !== i);
              const nextAnswers = value.answers
                .filter((a) => a !== i)
                .map((a) => (a > i ? a - 1 : a));
              const stillPinned = value.pinLastOption && !isLast;
              onChange({
                ...value,
                options: nextOptions,
                answers: nextAnswers,
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
                type="checkbox"
                checked={value.answers.includes(i)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...value.answers, i]
                    : value.answers.filter((a) => a !== i);
                  onChange({ ...value, answers: next });
                }}
                className="h-4 w-4 shrink-0 rounded-sm"
                aria-label={`将第 ${i + 1} 个选项设为答案`}
              />
            }
          />
        );
      })}
      {fieldErrors?.answers ? (
        <p className="text-xs text-destructive" role="alert">
          {fieldErrors.answers}
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

export const MultiChoiceForm = memo(MultiChoiceFormImpl);
