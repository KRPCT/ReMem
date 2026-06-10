// Phase 06-01: vitest stub for Next.js's "server-only" marker package.
//
// At runtime in a Server Component, `import "server-only"` throws
// because the package's default export is `throw new Error(...)`. The
// intent is to fail loudly if a server-only module is ever
// accidentally bundled into a client component.
//
// In the test environment we don't have a Server Component runtime
// (we run plain vitest on Node), so the throw would block every
// import of `src/lib/fsrs/scheduler.ts` and `src/lib/fsrs/undo.ts`.
// This empty module replaces the real one via the `server-only`
// alias in vitest.config.ts.
export {};
