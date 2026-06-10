"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CARD_TYPES } from "@/lib/validation";
import {
  parseImportAction,
  confirmImportAction,
  type ParseImportState,
} from "./import-cards-action";

// Import type options: "auto" (mixed, default) first, then the 5 explicit types.
const TYPE_OPTIONS = ["auto", ...CARD_TYPES] as const;
type ImportType = (typeof TYPE_OPTIONS)[number]; // CardType | "auto"

// Chinese labels for the <Select> dropdown.
const TYPE_LABELS: Record<ImportType, string> = {
  auto: "自动识别（混合）",
  choice: "选择题",
  multi_choice: "多选题",
  fill: "填空题",
  qa: "问答题",
  judge: "判断题",
};

// Placeholder shows the minimal syntax. === separates cards, --- separates
// front/back. Choice/multi use letter-labeled options (A. / B. ...) plus a
// separate `答案: A` line (copy-robust); {{c1::}} -> fill; "答案: 正确/错误" ->
// judge; otherwise qa.
const TYPE_PLACEHOLDER: Record<ImportType, string> = {
  auto: `问答题正面
---
问答题答案

===

单选题题干
A. 选项一
B. 选项二
答案: B

===

填空题用 {{c1::答案}} 挖空

===

判断题陈述。
答案: 正确`,

  qa: `问题内容
---
答案内容

===

第二个问题
---
第二个问答的答案`,

  choice: `哪个星球离太阳最近？
A. 地球
B. 水星
C. 金星
D. 火星
答案: B
---
水星是最内侧的行星。

===

天空的颜色是：
A. 红色
B. 蓝色
C. 绿色
答案: B`,

  multi_choice: `以下哪些是惰性气体？
A. 氦
B. 氮
C. 氖
D. 氩
答案: A、C、D
---
He、Ne、Ar 属于第 18 族（惰性气体）。`,

  fill: `光在真空中的速度约为 {{c1::299792458}} m/s。
---
c = 299,792,458 m/s（SI 定义的精确值）

===

水在 {{c1::0}} 摄氏度结冰，在 {{c2::100}} 摄氏度沸腾。`,

  judge: `万里长城在太空中可以用肉眼看到。
答案: 错误
---
这是一个常见的误解。长城太窄，从太空无法分辨。

===

水在海平面 100 摄氏度时沸腾。
答案: 正确`,
};

export function ImportCardsForm({ deckId }: { deckId: string }) {
  const [cardType, setCardType] = useState<ImportType>("auto");
  const [text, setText] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseImportState>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleTypeChange = (v: ImportType) => {
    setCardType(v);
    // Clear stale preview when type changes — the cards would be
    // re-parsed anyway; showing stale data is misleading.
    setParseResult(null);
    setSuccessMsg(null);
  };

  const handleParse = () => {
    const fd = new FormData();
    fd.set("deckId", deckId);
    fd.set("cardType", cardType);
    fd.set("text", text);
    setSuccessMsg(null);
    startTransition(async () => {
      const result = await parseImportAction(null, fd);
      setParseResult(result);
    });
  };

  const handleConfirm = () => {
    const fd = new FormData();
    fd.set("deckId", deckId);
    fd.set("cardType", cardType);
    fd.set("text", text);
    startTransition(async () => {
      const result = await confirmImportAction(null, fd);
      if (result?.error) {
        setParseResult({ error: result.error });
      } else if (result?.imported !== undefined) {
        const skipped = result.skipped ?? 0;
        setSuccessMsg(
          skipped > 0
            ? `已导入 ${result.imported} 张，跳过 ${skipped} 张`
            : `已导入 ${result.imported} 张`
        );
        setText("");
        setParseResult(null);
      }
    });
  };

  // File upload is the primary path: reading raw file bytes client-side avoids
  // the "- [x]" -> "- [ ]" downgrade that copy/paste through a renderer causes.
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    file
      .text()
      .then((content) => {
        setText(content);
        setFileName(file.name);
        setParseResult(null);
        setSuccessMsg(null);
      })
      .catch(() => setParseResult({ error: "读取文件失败" }));
  };

  const topError =
    parseResult && "error" in parseResult && parseResult.error
      ? parseResult.error
      : null;
  const cards = parseResult && "cards" in parseResult ? (parseResult.cards ?? []) : [];
  const errors = parseResult && "errors" in parseResult ? (parseResult.errors ?? []) : [];
  const hasPreview = parseResult !== null && !topError;

  return (
    <div className="space-y-4">
      {/* Card type selector */}
      <div className="flex items-center gap-3">
        <Label htmlFor="import-card-type">卡片类型</Label>
        <Select
          value={cardType}
          onValueChange={(v) => handleTypeChange(v as ImportType)}
        >
          <SelectTrigger id="import-card-type" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* File upload — primary path; reading raw bytes avoids the - [x] -> - [ ]
          mangling that copy/paste through a renderer (chat / md preview) causes. */}
      <div className="space-y-1">
        <Label>上传文件（推荐）</Label>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            选择 .md / .txt 文件
            <input
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          {fileName ? (
            <span
              className="text-xs"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              已载入 {fileName}
            </span>
          ) : null}
          <a
            href="/card-import-sample.md"
            download
            className="text-xs underline"
            style={{ color: "hsl(var(--color-brand-background))" }}
          >
            下载示例文件（含 KaTeX / 代码 / 图表）
          </a>
        </div>
      </div>

      {/* Markdown content — preview of the uploaded file, or paste/edit by hand */}
      <div className="space-y-1">
        <Label htmlFor="import-text">内容预览 / 手动编辑</Label>
        <Textarea
          id="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={TYPE_PLACEHOLDER[cardType]}
          className="min-h-[180px] font-mono text-sm"
        />
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          多张卡片用 === 分隔；正反面用 --- 分隔，可混排自动识别。选择/多选题用
          A./B. 列选项，再单独一行写 答案: A（多选 答案: A、C）。
        </p>
      </div>

      {/* Top-level action error */}
      {topError ? (
        <p
          className="text-sm"
          style={{ color: "hsl(var(--destructive))" }}
          role="alert"
          aria-live="polite"
        >
          {topError}
        </p>
      ) : null}

      {/* Success message after confirm */}
      {successMsg ? (
        <p
          className="text-sm"
          style={{ color: "hsl(var(--color-brand-background))" }}
          role="status"
        >
          {successMsg}
        </p>
      ) : null}

      {/* Parse button */}
      <div className="flex justify-start">
        <Button
          type="button"
          variant="outline"
          onClick={handleParse}
          disabled={pending || text.trim() === ""}
        >
          {pending && !hasPreview ? "解析中..." : "解析预览"}
        </Button>
      </div>

      {/* Preview region — only shown after a successful parse */}
      {hasPreview ? (
        <div
          className="space-y-3 rounded-xl border p-4"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <p className="text-sm">
            解析成功{" "}
            <span style={{ color: "hsl(var(--color-brand-background))" }}>
              {cards.length}
            </span>{" "}
            张，失败{" "}
            <span
              style={{
                color:
                  errors.length > 0
                    ? "hsl(var(--destructive))"
                    : "hsl(var(--muted-foreground))",
              }}
            >
              {errors.length}
            </span>{" "}
            张
          </p>

          {/* Per-row failure list */}
          {errors.length > 0 ? (
            <ul className="space-y-1">
              {errors.map((e, i) => (
                <li
                  key={i}
                  className="text-xs"
                  style={{ color: "hsl(var(--destructive))" }}
                >
                  {e.row > 0 ? `第 ${e.row} 行: ` : ""}
                  {e.message}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Confirm button — only when there are valid cards */}
          {cards.length > 0 ? (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
              >
                {pending ? "导入中..." : "确认导入"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
