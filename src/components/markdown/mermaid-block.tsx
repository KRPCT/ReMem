"use client";

import { useEffect, useId, useRef, useState } from "react";

interface MermaidBlockProps {
  code: string;
}

/**
 * Client island that renders a Mermaid diagram from a code string.
 * Must be a client component (mermaid.render touches document).
 * Mermaid v11.4.1's `securityLevel: "strict"` provides built-in
 * sanitization, so no DOMPurify is needed (per threat model).
 */
export function MermaidBlock({ code }: MermaidBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  // useId() gives a stable, collision-free id per component instance
  // (survives HMR, unique across the React tree). The Math.random
  // suffix stays so two consecutive renders with the same code prop
  // (e.g. after a code mutation in edit mode) get distinct ids —
  // Mermaid v11's internal id→diagram map throws "Diagram already
  // registered" if the same id is rendered twice. (WR-05)
  const reactId = useId();
  const idRef = useRef(
    `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}-${Math.random().toString(36).slice(2, 6)}`
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        const isDark =
          document.documentElement.dataset.theme !== "light";
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
        });
        const { svg: rendered } = await mermaid.render(
          idRef.current,
          code
        );
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "渲染失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre
        data-testid="mermaid-block"
        className="overflow-x-auto rounded-xl bg-card p-3 text-sm text-destructive"
      >
        Mermaid 错误: {error}
        {"\n\n"}
        {code}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      data-testid="mermaid-block"
      className="my-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
