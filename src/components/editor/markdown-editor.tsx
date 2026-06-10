"use client";

import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Code,
  Code2,
  List,
  ListOrdered,
  Image as ImageIcon,
  Eye,
  PencilLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { cn } from "@/lib/utils";

export interface MarkdownEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: string;
  enableImageUpload?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
  ariaLabel?: string;
}

/**
 * Imperative API exposed via `ref`. Lets a parent (e.g. the fill
 * form's "插入挖空" button) insert pre-built snippets at the
 * editor's current cursor position without owning the textarea
 * ref itself.
 */
export interface MarkdownEditorHandle {
  /**
   * Insert `{{cN::}}` at the current cursor position. The N is
   * caller-controlled (1-based cloze index). The cursor lands
   * between the two colons, ready for the user to type the
   * answer/hint.
   */
  insertCloze(index: number): void;
  /**
   * Insert `{{#N}}` at the current cursor position — the
   * index-only cloze syntax. Useful when no inline hint is
   * needed; the renderer maps the N to `typeData.answers[N-1]`.
   */
  insertClozeHash(index: number): void;
  /**
   * Insert arbitrary text at the current cursor position.
   * Useful for "插入手动占位符" style helpers.
   */
  insertAtCursor(text: string): void;
  /**
   * Focus the textarea. Useful for "回到题目编辑" CTAs.
   */
  focus(): void;
}

type InsertOp =
  | { before: string; after?: string; linePrefix?: undefined }
  | { linePrefix: string; before?: undefined; after?: undefined };

// ─── Small selection helpers ─────────────────────────────────────────────

function wrap(
  el: HTMLTextAreaElement,
  before: string,
  after: string,
  emit: (v: string) => void
): void {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const next =
    value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
  emit(next);
  // Restore selection after React re-renders the textarea.
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = s + before.length;
    el.selectionEnd = e + before.length;
  });
}

function wrapMultiline(
  el: HTMLTextAreaElement,
  before: string,
  after: string,
  emit: (v: string) => void
): void {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const next =
    value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
  emit(next);
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = s + before.length;
    el.selectionEnd = s + before.length;
  });
}

function prefixLines(
  el: HTMLTextAreaElement,
  prefix: string,
  emit: (v: string) => void
): void {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const head = value.slice(0, s);
  const tail = value.slice(e);
  const middle = value.slice(s, e);
  const lines = middle.length === 0
    ? prefix
    : middle
        .split("\n")
        .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
        .join("\n");
  const next = head + lines + tail;
  emit(next);
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = s;
    el.selectionEnd = s + lines.length;
  });
}

/**
 * Insert an upload placeholder, fire the upload, then swap the
 * placeholder for the final ![](url) when the upload resolves.
 *
 * Mirrors the old CodeMirror image-upload-extension behavior:
 * - inline base64 fallback (5 MB cap) on upload failure
 * - placeholder retained if both upload + base64 fail
 */
async function handleImageUpload(
  el: HTMLTextAreaElement,
  file: File,
  upload: (f: File) => Promise<string>,
  getValue: () => string,
  emit: (v: string) => void
): Promise<void> {
  const placeholder = `![uploading ${file.name}…]()`;
  const start = el.selectionStart;
  const value = el.value;
  emit(value.slice(0, start) + placeholder + value.slice(el.selectionEnd));

  const swap = (replacement: string) => {
    const current = getValue();
    const idx = current.indexOf(placeholder);
    if (idx < 0) return;
    emit(current.slice(0, idx) + replacement + current.slice(idx + placeholder.length));
  };

  try {
    const url = await upload(file);
    swap(`![${file.name}](${url})`);
  } catch {
    const MAX_B64 = 5 * 1024 * 1024;
    if (file.size > MAX_B64) {
      // Keep placeholder, warn — same behavior as the old extension.
      console.warn(
        `image upload failed and file > 5 MB; placeholder retained for ${file.name}`
      );
      return;
    }
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      swap(`![${file.name}](${b64})`);
    } catch {
      // Placeholder remains.
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────

type Tab = "edit" | "preview";

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    value,
    onChange,
    placeholder,
    minHeight,
    enableImageUpload = true,
    onImageUpload,
    ariaLabel,
  },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Image upload is opt-in: callers pass `onImageUpload`. The legacy
  // `enableImageUpload={false}` flag can disable it even when the
  // handler is set (used by tests / screenshots).
  const imageUploadActive = Boolean(enableImageUpload && onImageUpload);

  const [tab, setTab] = useState<Tab>("edit");
  const deferredValue = useDeferredValue(value);
  const reactId = useId();
  const editorId = `md-editor-${reactId}`;
  const previewId = `md-preview-${reactId}`;

  // Auto-grow textarea to fit content (capped via max-h-* class).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
  }, [value]);

  // Imperative API for parent callers (e.g. fill-form's "插入挖空"
  // button). Mirrors the toolbar wrap() behavior: insert text at
  // the current cursor and place the caret right after the insert.
  const insertText = useCallback(
    (text: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const s = el.selectionStart ?? el.value.length;
      const e = el.selectionEnd ?? s;
      const next = el.value.slice(0, s) + text + el.value.slice(e);
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = s + text.length;
        el.selectionEnd = s + text.length;
      });
    },
    [onChange]
  );

  useImperativeHandle(
    ref,
    (): MarkdownEditorHandle => ({
      insertCloze(index) {
        // Place the caret between the two colons so the user can
        // type the hint/answer immediately. `{{cN::}}` is the
        // canonical Anki cloze syntax consumed by card-body.tsx.
        insertText(`{{c${index}::}}`);
      },
      insertClozeHash(index) {
        // Shorter `{{#N}}` form. Same renderer mapping; just
        // omits the optional hint slot.
        insertText(`{{#${index}}}`);
      },
      insertAtCursor(text) {
        insertText(text);
      },
      focus() {
        textareaRef.current?.focus();
      },
    }),
    [insertText]
  );

  const exec = useCallback(
    (op: InsertOp) => {
      const el = textareaRef.current;
      if (!el) return;
      if (op.linePrefix !== undefined) {
        prefixLines(el, op.linePrefix, onChange);
        return;
      }
      if (op.after === undefined && op.before.includes("\n")) {
        // Multi-line wrap (used by code block button).
        wrapMultiline(el, op.before, "", onChange);
        return;
      }
      wrap(el, op.before, op.after ?? op.before, onChange);
    },
    [onChange]
  );

  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const el = textareaRef.current;
      if (file && el && imageUploadActive && onImageUpload) {
        void handleImageUpload(
          el,
          file,
          onImageUpload,
          () => valueRef.current,
          onChange
        );
      }
      // Reset so the same file can be re-selected next time.
      e.target.value = "";
    },
    [onChange, onImageUpload, imageUploadActive]
  );

  // Paste + drop integration: same UX as the old CodeMirror handler.
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!imageUploadActive || !onImageUpload) return;
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      e.preventDefault();
      const el = textareaRef.current;
      if (!el) return;
      for (const file of images) {
        void handleImageUpload(
          el,
          file,
          onImageUpload,
          () => valueRef.current,
          onChange
        );
      }
    },
    [onChange, onImageUpload, imageUploadActive]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      if (!imageUploadActive || !onImageUpload) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      e.preventDefault();
      const el = textareaRef.current;
      if (!el) return;
      for (const file of images) {
        void handleImageUpload(
          el,
          file,
          onImageUpload,
          () => valueRef.current,
          onChange
        );
      }
    },
    [onChange, onImageUpload, imageUploadActive]
  );

  // ─── Render ──────────────────────────────────────────────────────────
  const previewHidden = "hidden lg:block";
  const editorWrapClass =
    "relative flex min-h-[12rem] w-full flex-col rounded-xl border border-border bg-card";

  return (
    <div className={editorWrapClass}>
      {/* Toolbar */}
      <div className="flex min-h-toolbar flex-wrap items-center gap-s border-b border-border bg-card/30 px-s">
        <ToolbarBtn label="加粗" onClick={() => exec({ before: "**" })}>
          <Bold className="h-4 w-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn label="斜体" onClick={() => exec({ before: "*" })}>
          <Italic className="h-4 w-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          label="链接"
          onClick={() => exec({ before: "[", after: "](url)" })}
        >
          <LinkIcon className="h-4 w-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn label="行内代码" onClick={() => exec({ before: "`" })}>
          <Code className="h-4 w-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          label="代码块"
          onClick={() => exec({ before: "```\n", after: "\n```" })}
        >
          <Code2 className="h-4 w-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn label="列表" onClick={() => exec({ linePrefix: "- " })}>
          <List className="h-4 w-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          label="有序列表"
          onClick={() => exec({ linePrefix: "1. " })}
        >
          <ListOrdered className="h-4 w-4" aria-hidden />
        </ToolbarBtn>
        {imageUploadActive ? (
          <ToolbarBtn
            label="插入图片"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-4 w-4" aria-hidden />
          </ToolbarBtn>
        ) : null}

        {/* Vertical separator — visually groups the 8 tool buttons
         * (left) and the Edit/Preview mode switcher (right). */}
        <div
          aria-hidden
          className="mx-1 hidden h-5 w-px shrink-0 bg-border sm:block"
        />

        {/* Edit/Preview mode switcher (mobile only — desktop uses the
         * split-pane layout, so this row collapses on lg+). */}
        <div className="flex items-center gap-s sm:ml-auto lg:ml-0 lg:hidden">
          <TabBtn active={tab === "edit"} onClick={() => setTab("edit")}>
            <PencilLine className="h-4 w-4" aria-hidden />
            <span className="ml-1 text-xs">编辑</span>
          </TabBtn>
          <TabBtn active={tab === "preview"} onClick={() => setTab("preview")}>
            <Eye className="h-4 w-4" aria-hidden />
            <span className="ml-1 text-xs">预览</span>
          </TabBtn>
        </div>
      </div>

      {/* Hidden file input for the toolbar image button */}
      {imageUploadActive ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileSelected}
          aria-hidden
          tabIndex={-1}
        />
      ) : null}

      {/* Split pane (desktop) / tabs (mobile) */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-2">
        <div
          className={cn(
            "border-border lg:border-r",
            tab === "edit" ? "block" : "hidden lg:block"
          )}
        >
          <textarea
            ref={textareaRef}
            id={editorId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            onDrop={onDrop}
            placeholder={placeholder}
            aria-label={ariaLabel ?? "markdown-editor"}
            spellCheck={false}
            className="block w-full resize-none bg-transparent p-m font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
            style={{
              minHeight: minHeight ?? "200px",
              maxHeight: "480px",
            }}
          />
        </div>

        <div
          id={previewId}
          aria-label="预览"
          className={cn(
            "min-h-[12rem] overflow-auto bg-background/30 p-m",
            tab === "preview" ? "block" : previewHidden
          )}
          style={{ maxHeight: "480px" }}
        >
          {deferredValue.trim().length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              预览将在你输入时显示...
            </p>
          ) : (
            <MarkdownRenderer content={deferredValue} />
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Subcomponents ───────────────────────────────────────────────────────

function ToolbarBtn({
  label,
  onClick,
  children,
  ariaExpanded,
  ariaHasPopup,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  ariaExpanded?: boolean;
  ariaHasPopup?: "menu";
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-sm px-s text-xs transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/40"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
