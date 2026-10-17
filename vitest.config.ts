import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "src/compat/**/tests/**/*.test.ts"],
  },
});
