import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // Phase 06-01: stub the Next.js "server-only" marker package so
      // that vitest can import modules guarded by `import "server-only"`.
      // At runtime in a Server Component the real `server-only` package
      // throws (its default export is `throw new Error(...)`); in the
      // test environment we replace it with an empty module so the
      // import is a no-op.
      "server-only": resolve(__dirname, "test/shims/server-only.ts"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
