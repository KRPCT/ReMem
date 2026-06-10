"use client";

import dynamic from "next/dynamic";

export const DonutChartLazy = dynamic(
  () => import("./donut-chart").then((m) => ({ default: m.DonutChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 animate-pulse rounded-xl bg-muted/40" />
    ),
  }
);
