import { test, expect } from "@playwright/test";

// Exercise the injected iOS script against a real dedicated Worker. Only the
// WK script-message hop is replaced; native integration has its own driver.
for (const framework of ["hono", "express"]) {
  test.describe(`${framework} injected fetch`, () => {
    let formBodies: any[];
    test.beforeEach(async ({ context, page }) => {
      formBodies = [];
      const host = await context.newPage();
      await host.goto(`/runtime.html?framework=${framework}`);
      await page.goto("/");
      await expect(page.locator("#api")).toContainText("API ready");
      await page.goto("/pages/forms");
      await page.exposeBinding("testNativeMessage", async (_source, value) => {
        if (value.formNavigate) {
          formBodies.push(value.formNavigate);
          return true;
        }
        return host.evaluate(
          (value) => (window as any).dispatchPageFetch(value),
          value,
        );
      });
      await page.evaluate(() => {
        (window as any).webkit = {
          messageHandlers: {
            documentFetch: {
              postMessage: (value: unknown) =>
                (window as any).testNativeMessage(value),
            },
          },
        };
      });
      await page.addScriptTag({ url: "/page-fetch.js" });
    });
    for (const status of [301, 302, 303, 307, 308]) {
      test(`${status}: follow, manual and error`, async ({ page }) => {
        const result = await page.evaluate(async (status) => {
          const url = `/api/redirect/${status}`;
          const response = await fetch(url, { method: "POST", body: "日本語" });
          const clone = response.clone();
          const manual = await fetch(url, { redirect: "manual" });
          let error = "";
          try {
            await fetch(
              new Request(new URL(url, location.href), { redirect: "error" }),
            );
          } catch (e) {
            error = (e as Error).name;
          }
          return {
            url: response.url,
            redirected: response.redirected,
            value: await response.json(),
            cloneURL: clone.url,
            cloneRedirected: clone.redirected,
            cloneValue: await clone.json(),
            manual: {
              status: manual.status,
              type: manual.type,
              body: await manual.text(),
              headers: [...manual.headers],
              cloneType: manual.clone().type,
            },
            error,
          };
        }, status);
        expect(result.url).toBe(
          new URL(`/api/echo?via=${status}`, page.url()).href,
        );
        expect(result.redirected).toBe(true);
        expect(result.cloneURL).toBe(result.url);
        expect(result.cloneRedirected).toBe(true);
        expect(result.cloneValue).toEqual(result.value);
        expect(result.value).toMatchObject({
          method: status >= 307 ? "POST" : "GET",
          text: status >= 307 ? "日本語" : "",
        });
        expect(result.manual).toEqual({
          status: 0,
          type: "opaqueredirect",
          body: "",
          headers: [],
          cloneType: "opaqueredirect",
        });
        expect(result.error).toBe("TypeError");
      });
    }
    test("FormData fetch preserves binary bytes", async ({ page }) => {
      const value = await page.evaluate(async () => {
        const data = new FormData();
        data.append(
          "upload",
          new File([new Uint8Array([0, 1, 128, 255])], "bytes.bin", {
            type: "application/octet-stream",
          }),
        );
        return (
          await fetch("/api/echo", { method: "POST", body: data })
        ).json();
      });
      expect(value.fields).toEqual([
        [
          "upload",
          {
            name: "bytes.bin",
            type: "application/octet-stream",
            bytes: [0, 1, 128, 255],
          },
        ],
      ]);
    });
    test("native form data includes submitter overrides and application changes", async ({
      page,
    }) => {
      await page.locator("#upload-form input[type=file]").setInputFiles({
        name: "bytes.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from([0, 1, 128, 255]),
      });
      await page.evaluate(() => {
        const form = document.querySelector<HTMLFormElement>("#upload-form")!;
        form
          .querySelector("button")!
          .setAttribute("formaction", "./echo?override=yes");
        form.addEventListener("formdata", (event) =>
          event.formData.set("message", "updated 日本語"),
        );
      });
      await page.getByRole("button", { name: "Upload" }).click();
      // The native-navigation hop is mocked here; native tests verify the new document.
      await expect.poll(() => formBodies.length).toBe(1);
      const message = formBodies[0];
      expect(message.url).toBe(
        new URL("/pages/echo?override=yes", page.url()).href,
      );
      const data = await new Response(Buffer.from(message.body, "base64"), {
        headers: message.headers,
      }).formData();
      expect(data.get("message")).toBe("updated 日本語");
      expect(data.get("action")).toBe("upload");
      const file = data.get("upload") as File;
      expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
        0, 1, 128, 255,
      ]);
    });
    test("form.submit bypasses validation without adding a submitter", async ({
      page,
    }) => {
      await page.evaluate(() => {
        const form = document.querySelector<HTMLFormElement>("#upload-form")!;
        const field = form.querySelector<HTMLInputElement>(
          'input[name="message"]',
        )!;
        field.required = true;
        field.value = "";
        form.addEventListener("submit", () => {
          throw new Error("submit event must not fire");
        });
        form.submit();
      });
      await expect(page).toHaveURL(/\/pages\/forms$/);
      await expect.poll(() => formBodies.length).toBe(1);
      const message = formBodies[0];
      const data = await new Response(Buffer.from(message.body, "base64"), {
        headers: message.headers,
      }).formData();
      expect(data.get("message")).toBe("");
      expect(data.get("action")).toBeNull();
    });
    test("validation and prevented submit do not send a native body", async ({
      page,
    }) => {
      const counts = await page.evaluate(async () => {
        const form = document.querySelector<HTMLFormElement>("#upload-form")!;
        const input = form.querySelector<HTMLInputElement>(
          'input[name="message"]',
        )!;
        input.required = true;
        input.value = "";
        let submissions = 0;
        form.addEventListener("submit", (event) => {
          submissions++;
          event.preventDefault();
        });
        form.requestSubmit();
        const invalid = submissions;
        input.value = "valid";
        form.requestSubmit();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { invalid, valid: submissions };
      });
      expect(counts).toEqual({ invalid: 0, valid: 1 });
      expect(formBodies).toEqual([]);
      await expect(page).toHaveURL(/\/pages\/forms$/);
    });
  });
}
