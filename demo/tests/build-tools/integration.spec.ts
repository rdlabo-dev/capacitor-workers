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
      if (build !== "raw") {
        // node: and bare specifiers resolve to one profile per bundler.
        expect(report.resolved).toEqual(Array(11).fill(true));
        expect(
          report.node.direct
            .flatMap((result) => result.cases)
            .filter((c) => c.status !== "passed"),
        ).toEqual([]);
        expect(
          report.node.direct.flatMap((result) =>
            result.cases.map((c) => c.status),
          ),
        ).toEqual(Array(49).fill("passed"));
      }
    });
  }
}
// The node contract worker is the configured entry of these builds, so
// prefer=worker runs the contracts inside the bundled Dedicated Worker and
// prefer=direct runs them in-page; no Worker-entry transform is needed.
for (const build of ["vite-node", "esbuild-node"]) {
  for (const prefer of ["worker", "direct"] as const) {
    test(`${build}: ${prefer} runs the node module contracts`, async ({
      page,
    }) => {
      await page.goto(`/${build}/${build === "vite-node" ? "node.html" : ""}`);
      await page.waitForFunction(
        () => typeof window.runNodeBuild === "function",
      );
      const report = await page.evaluate(
        (prefer) => window.runNodeBuild(prefer),
        prefer,
      );
      expect(report.execution).toBe(prefer);
      const statuses = (
        report.contracts as {
          cases: { id: string; status: string }[];
        }[]
      ).flatMap((result) => result.cases.map((c) => c.status));
      expect(
        (report.contracts as { cases: { status: string }[] }[])
          .flatMap((r) => r.cases)
          .filter((c) => c.status !== "passed"),
      ).toEqual([]);
      expect(statuses).toEqual(Array(49).fill("passed"));
    });
  }
}
