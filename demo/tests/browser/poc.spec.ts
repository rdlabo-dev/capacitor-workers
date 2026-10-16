import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:4188" });

test("Hono and real Express run entirely in the browser", async ({
  page,
  context,
}) => {
  const apiRequests: string[] = [];
  page.on("pageerror", (error) => console.log("PAGE_ERROR", error));
  page.on("request", (request) => {
    if (
      request.url().includes("/api/") ||
      request.url().includes("worker.invalid")
    )
      apiRequests.push(request.url());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.pocDone);
  const results = await page.evaluate(() => window.pocResults);
  expect(results, await page.locator("pre").innerText()).toHaveLength(26);
  expect(results?.filter((r) => !r.ok)).toEqual([]);
  expect(apiRequests).toEqual([]);
  // Re-run with the actual network disabled after all modules/assets are loaded.
  await context.setOffline(true);
  const offline = await page.evaluate(() => window.runOfflineContract());
  expect(offline).toHaveLength(18);
  expect(offline.filter((r) => !r.ok)).toEqual([]);
  expect(apiRequests).toEqual([]);
  await expect(page.locator("h1")).toHaveText("PASS 26/26");
  await page.screenshot({
    path: `artifacts/browser-${test.info().project.name}.png`,
    fullPage: true,
  });
});
