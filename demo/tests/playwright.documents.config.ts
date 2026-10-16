import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./documents",
  outputDir: "../test-results/documents",
  forbidOnly: !!process.env.CI,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:4185" },
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command:
      "vite preview --config tests/fixtures/apps/native-documents/vite.config.ts --host 127.0.0.1 --port 4185 --strictPort",
    url: "http://127.0.0.1:4185",
    reuseExistingServer: false,
  },
});
