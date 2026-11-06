import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname) },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/concurrency/**/*.test.ts",
    ],
    // Run test files serially: beforeEach truncations in one file must not
    // race with another file's setup inserts. Tests use DATABASE_URL from env.
    // For isolation, set TEST_DATABASE_URL=postgres://...slotbook_test
    // to point tests at a separate DB that does not affect the running app.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
