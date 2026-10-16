import { defineConfig } from "@playwright/test";
export default defineConfig({
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  testDir: "tests/experiments",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run preview:experiment",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
    stdout: "pipe",
  },
  use: { baseURL: "http://127.0.0.1:4181" },
});
