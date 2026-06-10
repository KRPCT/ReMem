import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Disable client-side router cache for dynamic routes. The 30s default
    // (Next.js 15) was masking Server Action revalidations: after creating
    // a deck and being redirected to /decks/[id], the browser would serve
    // a stale /decks HTML when the user navigated back, hiding the new
    // deck until a hard refresh. Every page in this app is user-scoped
    // and changes often - 0 is the right value.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
export default analyze(nextConfig);
