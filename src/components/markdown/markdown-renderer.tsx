import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { MermaidBlock } from "./mermaid-block";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * RSC-safe Markdown renderer. Uses react-markdown with GFM, math, and
 * highlight.js plugins. Mermaid code blocks are intercepted and
 * rendered as a client island via <MermaidBlock>.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-neutral dark:prose-invert max-w-none",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          code: (props: ComponentPropsWithoutRef<"code">) => {
            const { className: codeClassName, children, ...rest } = props;
            const langMatch = /language-(\w+)/.exec(codeClassName || "");
            const lang = langMatch?.[1];
            if (lang === "mermaid") {
              return (
                <MermaidBlock code={String(children).trim()} />
              );
            }
            return (
              <code className={codeClassName} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
