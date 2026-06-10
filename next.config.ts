import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // demo branch: skip ESLint during the Vercel build. Lint stays enforced on
  // main via `pnpm lint`; here it only flakes on fresh strict-pnpm installs
  // (eslint-plugin-react-hooks not hoisted) and must never block a deploy.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Disable client-side router cache for dynamic routes. The 30s default
    // (Next.js 15) was masking Server Action revalidations: after creating
    // a deck and being redirected to /decks/[id], the browser would serve
    // a stale /decks HTML when the user navigated back, hiding the new
    // deck until a hard refresh. Every page in this app is user-scoped
    // and changes often — 0 is the right value.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
};

export default nextConfig;
