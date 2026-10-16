import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  test: {
    include: ["tests/workers/**/*.test.ts"],
    hookTimeout: 60_000,
  },
});
