"use client";

import dynamic from "next/dynamic";

export const MarkdownRendererLazy = dynamic(
  () =>
    import("./markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-20 animate-pulse rounded-lg bg-muted" />
    ),
  }
);
