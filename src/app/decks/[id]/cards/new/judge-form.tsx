"use client";

import { memo } from "react";
import { Label } from "@/components/ui/label";

export type JudgeFormValue = {
  type: "judge";
  correct: boolean;
};

export interface JudgeFormProps {
  value: JudgeFormValue;
  onChange: (v: JudgeFormValue) => void;
  fieldErrors?: Record<string, string>;
}

function JudgeFormImpl({ value, onChange }: JudgeFormProps) {
  return (
    <div className="space-y-2">
      <Label>正确答案</Label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="judge-correct"
            checked={value.correct === true}
            onChange={() => onChange({ ...value, correct: true })}
            className="h-4 w-4 rounded-sm"
            aria-label="正确"
          />
          正确
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="judge-correct"
            checked={value.correct === false}
            onChange={() => onChange({ ...value, correct: false })}
            className="h-4 w-4 rounded-sm"
            aria-label="错误"
          />
          错误
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        判断题 - 用户答题时直接选对错
      </p>
    </div>
  );
}

export const JudgeForm = memo(JudgeFormImpl);
