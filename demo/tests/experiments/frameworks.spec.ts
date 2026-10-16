import { test, expect } from "@playwright/test";

for (const framework of ["hono", "express"] as const) {
  test(`${framework}: unchanged Worker runs isolated and offline`, async ({
    page,
    context,
  }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.startsWith("/api/") ||
        request.url().includes("worker.invalid")
      )
        apiRequests.push(request.url());
    });
    await page.goto("/");
    await page.waitForFunction(
      () => typeof window.startExperiment === "function",
    );
    await page.evaluate(async (framework) => {
      window.experiment = window.startExperiment(
        location.origin,
        "https://worker.invalid/api",
        framework,
      );
      await window.experiment.ready;
    }, framework);
    // The Worker module is loaded; all following API requests must remain local.
    await context.setOffline(true);
    try {
      const results = await page.evaluate(
        (framework) => window.runFrameworkContract(framework),
        framework,
      );
      expect(results).toHaveLength(11);
      expect(results.filter((result) => !result.ok)).toEqual([]);
      await page.evaluate(() => window.experiment.drain());
      await expect
        .poll(() => page.evaluate(() => window.experiment.activeCalls))
        .toBe(0);
      expect(await page.evaluate(() => window.experiment.errors)).toEqual([]);
      expect(apiRequests).toEqual([]);
    } finally {
      await page.evaluate(() => window.experiment.dispose());
    }
  });
}
