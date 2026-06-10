"use client";

import dynamic from "next/dynamic";

export const RetentionCurveLazy = dynamic(
  () =>
    import("./retention-curve").then((m) => ({ default: m.RetentionCurve })),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
    ),
  }
);
