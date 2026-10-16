import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/workers/**/*.test.ts"],
    hookTimeout: 60_000,
  },
});
