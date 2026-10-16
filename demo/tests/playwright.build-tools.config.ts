import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "../test-results",
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  testDir: "./build-tools",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command:
      "vite preview --config tests/fixtures/apps/build-tools/preview.config.ts --host 127.0.0.1 --port 4185 --strictPort",
    url: "http://127.0.0.1:4185/raw/",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4185" },
});
