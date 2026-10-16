import { test, expect } from "@playwright/test";
import { cases } from "./cases";

for (const prefer of ["direct", "worker"] as const) {
  for (const sample of cases) {
    test(`${prefer}: GET ${sample.path}`, async ({ page }) => {
      await page.goto(`/?prefer=${prefer}`);
      await page.waitForFunction(() => window.upstreamReady !== undefined);
      expect(await page.evaluate(() => window.upstreamReady)).toBe(prefer);
      const response = await page.evaluate(async (path) => {
        const response = await fetch(path);
        return {
          status: response.status,
          contentType: response.headers.get("content-type"),
          body: await response.text(),
        };
      }, sample.path);
      expect(response.status).toBe(sample.status);
      expect(response.contentType).toContain(sample.contentType);
      for (const text of sample.text) expect(response.body).toContain(text);
    });
  }
}
