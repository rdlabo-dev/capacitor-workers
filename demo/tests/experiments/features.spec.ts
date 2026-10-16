import { expect, test } from "@playwright/test";
test("one feature standard covers direct/isolated fetch, state and engine capability", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.runFeatures === "function");
  const reports = await page.evaluate(() => window.runFeatures());
  expect(reports.map((report) => report.cases.length)).toEqual([4, 4, 3, 2]);
  expect(
    reports
      .flatMap((report) => report.cases)
      .every((test) => test.status === "passed"),
  ).toBe(true);
});
