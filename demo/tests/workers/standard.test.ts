import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { workers } from "../../cloudflare.config";

describe.each(["hono", "express"] as const)(
  "%s Worker — standard",
  (framework) => {
    const worker = workers[framework];
    const harness = createTestHarness({
      workers: [
        {
          config: {
            name: worker.name,
            main: worker.entrypoint,
            compatibility_date: worker.compatibilityDate,
            compatibility_flags: worker.compatibilityFlags,
          },
        },
      ],
    });

    beforeAll(async () => {
      await harness.listen();
    });
    afterAll(async () => {
      await harness.close();
    });

    it("GET + query", async () => {
      const response = await harness.fetch("/api/hello?name=Capacitor");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        message: "Hello from Workers",
        name: "Capacitor",
      });
    });

    it("POST JSON + status", async () => {
      const body = { text: "日本語 🍷", value: 42 };
      const response = await harness.fetch("/api/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual(body);
    });

    it("Router + params", async () => {
      const response = await harness.fetch("/api/items/123");
      expect(await response.json()).toEqual({ id: "123" });
    });

    it("Middleware header", async () => {
      const response = await harness.fetch("/api/hello");
      expect(response.headers.get("x-framework")).toBe(framework);
    });

    it("404", async () => {
      expect((await harness.fetch("/api/missing")).status).toBe(404);
    });

    it("Error middleware", async () => {
      const response = await harness.fetch("/api/error");
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "expected failure" });
    });

    it("204 empty body", async () => {
      const response = await harness.fetch("/api/empty");
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    });

    it("HEAD", async () => {
      const response = await harness.fetch("/api/hello", { method: "HEAD" });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
    });

    it("Concurrent requests", async () => {
      const values = await Promise.all(
        ["a", "b", "c"].map(async (id) =>
          (await harness.fetch(`/api/items/${id}`)).json(),
        ),
      );
      expect(values).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    });
  },
);
