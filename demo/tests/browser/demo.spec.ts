import { test, expect } from "@playwright/test";

test("minimal demo calls the configured Worker", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://worker.invalid/"))
      requests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("pre")).toHaveText(
    JSON.stringify(
      { message: "Hello from Workers", name: "Capacitor" },
      null,
      2,
    ),
  );
  expect(requests).toEqual([]);
});
