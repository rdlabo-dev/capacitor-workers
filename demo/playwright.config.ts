import { defineConfig } from "@playwright/test";
export default defineConfig({
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  testDir: "tests/browser",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4173" },
});
