import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "../test-results",
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  testDir: "./browser",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: [
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      command: "npm run preview -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      command:
        "vite preview --config tests/validation/vite.config.ts --host 127.0.0.1 --port 4188 --strictPort",
      url: "http://127.0.0.1:4188",
      reuseExistingServer: false,
    },
  ],
  use: { baseURL: "http://127.0.0.1:4173" },
});
