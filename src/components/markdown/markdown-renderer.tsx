import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
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

// react-markdown's defaultUrlTransform strips data: URLs, which would blank out
// our inline base64 images. Allow ONLY safe raster image data URIs through
// (png/jpg/gif/webp); svg and every other data: payload still defer to the
// default transform, so the Phase 04 SVG/XSS ban holds at the render layer.
const INLINE_IMAGE_DATA_URI = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

function urlTransform(url: string): string {
  if (INLINE_IMAGE_DATA_URI.test(url)) return url;
  return defaultUrlTransform(url);
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
        urlTransform={urlTransform}
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
