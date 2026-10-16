import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./upstream/hono-jsx-ssr",
  testMatch: "browser.spec.ts",
  outputDir: "../artifacts/upstream/playwright",
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/upstream/playwright-results.json" }],
  ],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command:
      "vite preview --config tests/upstream/hono-jsx-ssr/browser/vite.config.ts --host 127.0.0.1 --port 4187 --strictPort",
    url: "http://127.0.0.1:4187",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:4187",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
