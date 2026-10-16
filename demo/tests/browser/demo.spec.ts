import { test, expect } from "@playwright/test";

for (const [framework, baseURL] of [
  ["Hono", "http://127.0.0.1:4173"],
  ["Express", "http://127.0.0.1:4186"],
] as const) {
  test.describe(framework, () => {
    test.use({ baseURL });
    test("same demo renders HTML from the selected Worker", async ({
      page,
    }) => {
      const requests: string[] = [];
      page.on("request", (request) => {
        if (request.url().startsWith("https://worker.invalid/"))
          requests.push(request.url());
      });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `Hello from ${framework}`,
      );
      await expect(page.locator("main p")).toHaveText(
        "This HTML was rendered by the Worker.",
      );
      expect(requests).toEqual([]);
    });
  });
}
