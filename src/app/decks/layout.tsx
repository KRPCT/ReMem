// Applies to the entire /decks subtree: /decks, /decks/new,
// /decks/[id], /decks/[id]/settings. Every page here is user-scoped
// (auth-gated, queries by userId, mutated by Server Actions), so
// we want zero client caching — no router cache, no bfcache, no HTTP cache.
//
// Why this layout exists (and not just per-page `dynamic = 'force-dynamic'`):
//   1) staleTimes.dynamic=0 (next.config.ts) handles the in-memory Next.js
//      client router cache.
//   2) `force-dynamic` on this layout sets Cache-Control:
//      private, no-cache, no-store, must-revalidate on every response,
//      which disables the browser bfcache. The bfcache is what was still
//      restoring a stale /decks HTML on back-nav after createDeckAction
//      had already mutated the DB.
//   3) Keeping it as a layout (not duplicated in 6 page.tsx files) means
//      every future /decks/* page inherits the behavior for free.
export const dynamic = "force-dynamic";

export default function DecksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
