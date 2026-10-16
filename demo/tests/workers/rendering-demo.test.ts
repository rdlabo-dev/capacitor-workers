import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
for (const framework of ["hono", "express"]) {
  describe(`${framework} public rendering demo`, () => {
    const harness = createTestHarness({
      workers: [
        {
          config: {
            name: "rendering-demo-" + framework,
            main: `rendering/workers/${framework}.${framework === "hono" ? "tsx" : "ts"}`,
            compatibility_date: "2026-10-01",
            compatibility_flags:
              framework === "express" ? ["nodejs_compat"] : [],
          },
        },
      ],
    });
    beforeAll(() => harness.listen());
    afterAll(() => harness.close());
    it("renders complete HTML at the application root and owns links", async () => {
      const response = await harness.fetch("/");
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toMatch(/^<!doctype html>/i);
      expect(body).toContain('href="/about"');
      expect(body).toContain('action="/greet"');
      expect((await harness.fetch("/about")).status).toBe(200);
    });
    it("accepts POST, redirects, and escapes the resulting HTML", async () => {
      const response = await harness.fetch("/greet", {
        method: "POST",
        body: new URLSearchParams({ name: "<script>" }),
        redirect: "manual",
      });
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/hello?name=%3Cscript%3E");
      const body = await (
        await harness.fetch(response.headers.get("location")!)
      ).text();
      expect(body).toContain("&lt;script&gt;");
      expect(body).not.toContain("<script>");
    });
    it("serves JSON from the same Fetch Handler", async () => {
      const response = await harness.fetch("/api/hello");
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(await response.json()).toHaveProperty("message");
    });
  });
}
