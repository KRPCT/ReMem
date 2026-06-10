import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Edge-safe Auth.js base config (D-10).
// Do NOT import Prisma / bcryptjs / @auth/prisma-adapter here — middleware runs on edge.
export default {
  // v1 single-server self-hosted: trust the host that requests come from.
  // (NextAuth v5 default is trustHost:false, which rejects localhost and any
  //  non-Vercel deployment with UntrustedHost — that's what caused the prod-mode
  //  /decks ↔ /login redirect loop on 2026-06-06.)
  //
  // Side effect: with trustHost:true, NextAuth also infers the canonical base
  // URL from the request's `Host` header when `NEXTAUTH_URL` is unset — so
  // the dev server works on any port (3000, 3001, 3002, …) without per-port
  // env tweaking. If `NEXTAUTH_URL` IS set, it overrides the host header
  // (useful behind a CDN that rewrites Host).
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
