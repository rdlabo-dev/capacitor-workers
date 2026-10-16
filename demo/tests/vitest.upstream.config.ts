import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Upstream sample checks run against the git-ignored clone under
// artifacts/upstream/. They require `test:upstream:prepare` first and are kept
// out of the default workers suite so it stays hermetic.
export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  test: {
    include: ["tests/upstream/**/*.test.ts"],
    hookTimeout: 60_000,
    allowOnly: false,
  },
});
