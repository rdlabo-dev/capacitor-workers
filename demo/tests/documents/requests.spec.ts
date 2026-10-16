import { test, expect } from "@playwright/test";
for (const framework of ["hono", "express"]) {
  test.describe(framework, () => {
    test.beforeEach(async ({ context, page }) => {
      const host = await context.newPage();
      await host.goto(`/runtime.html?framework=${framework}`);
      await page.goto("/");
      await expect(page.locator("#api")).toHaveText(
        `${framework === "hono" ? "Hono" : "Express"} API ready`,
      );
      await page.goto("/pages/forms");
    });
    test("POST form preserves duplicate fields, submitter and Unicode", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page).toHaveURL(/\/pages\/echo$/);
      const value = JSON.parse(await page.locator("#payload").innerText());
      expect(value.method).toBe("POST");
      expect(value.fields).toEqual([
        ["message", "日本語 & <tag>"],
        ["duplicate", "one"],
        ["duplicate", "two"],
        ["action", "save"],
      ]);
    });
    test("multipart file bytes reach the Worker", async ({ page }) => {
      await page.locator("#upload-form input[type=file]").setInputFiles({
        name: "bytes.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from([0, 1, 128, 255]),
      });
      await page.getByRole("button", { name: "Upload" }).click();
      const value = JSON.parse(await page.locator("#payload").innerText());
      expect(value.fields).toContainEqual([
        "upload",
        {
          name: "bytes.bin",
          type: "application/octet-stream",
          bytes: [0, 1, 128, 255],
        },
      ]);
    });
    for (const status of [301, 302, 303, 307, 308]) {
      test(`POST → ${status} updates URL and preserves HTTP method rules`, async ({
        page,
        browserName,
      }) => {
        test.fail(
          browserName === "webkit" && status >= 307,
          "Comparison only: WebKit Service Worker loses the replayed POST body; iOS uses the native scheme bridge instead.",
        );
        await page
          .locator("form")
          .first()
          .evaluate(
            (form: HTMLFormElement, status) =>
              (form.action = `/pages/redirect/${status}`),
            status,
          );
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page).toHaveURL(`/pages/echo?via=${status}`);
        const value = JSON.parse(await page.locator("#payload").innerText());
        expect(value.method).toBe(status >= 307 ? "POST" : "GET");
        expect(value.fields).toEqual(
          status >= 307
            ? [
                ["message", "日本語 & <tag>"],
                ["duplicate", "one"],
                ["duplicate", "two"],
                ["action", "save"],
              ]
            : [],
        );
        await page.goBack();
        await expect(page).toHaveURL("/pages/forms");
      });
    }
    test("fetch follows POST redirects with JSON body", async ({
      page,
      browserName,
    }) => {
      test.fail(
        browserName === "webkit",
        "Comparison only: WebKit does not expose redirected=true for these synthetic redirects.",
      );
      for (const status of [301, 302, 303, 307, 308]) {
        const result = await page.evaluate(async (status) => {
          const r = await fetch(`/api/redirect/${status}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: "日本語" }),
          });
          return {
            url: r.url,
            redirected: r.redirected,
            value: await r.json(),
          };
        }, status);
        expect(result.url).toContain(`/api/echo?via=${status}`);
        expect(result.redirected).toBe(true);
        expect(result.value.method).toBe(status >= 307 ? "POST" : "GET");
        expect(result.value.text).toBe(
          status >= 307 ? JSON.stringify({ text: "日本語" }) : "",
        );
      }
    });
  });
}
