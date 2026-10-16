import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "../test-results",
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  testDir: "./experiments",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command: "npm run preview:experiment",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
    stdout: "pipe",
  },
  use: { baseURL: "http://127.0.0.1:4181" },
});
