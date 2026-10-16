import { test, expect } from "@playwright/test";
for (const build of [
  "vite-hono",
  "vite-express",
  "esbuild-hono",
  "esbuild-express",
  "raw",
]) {
  for (const prefer of ["worker", "direct"] as const) {
    test(`${build}: ${prefer} runs the shared contract`, async ({ page }) => {
      await page.goto(`/${build}/`);
      await page.waitForFunction(
        () => typeof window.runBuildTool === "function",
      );
      const report = await page.evaluate(
        (prefer) => window.runBuildTool(prefer),
        prefer,
      );
      expect(report.execution).toBe(prefer);
      expect(report.cases).toHaveLength(build === "raw" ? 4 : 9);
      expect(report.cases.every((result) => result.ok)).toBe(true);
    });
  }
}
