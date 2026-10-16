import { defineConfig } from "@playwright/test";
import production from "./playwright.experiment.config";
export default defineConfig({
  ...production,
  testMatch: ["frameworks.spec.ts", "preference.spec.ts"],
  webServer: {
    command:
      "vite --config experiments/dedicated-worker/vite.config.ts --host 127.0.0.1 --port 4183 --strictPort",
    url: "http://127.0.0.1:4183",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4183" },
});
