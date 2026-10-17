import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    // Node module contract specs run via demo tests in workerd and WebViews.
    include: [
      "tests/unit/**/*.test.ts",
      "src/compat/cloudflare-node/index.spec.ts",
    ],
  },
});
