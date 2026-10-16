import { afterEach, expect, it, vi } from "vitest";
import { capacitorWorkers } from "../../src/index";
let runtime: ReturnType<typeof capacitorWorkers> | undefined;
const original = globalThis.fetch;
afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
  globalThis.fetch = original;
  vi.unstubAllGlobals();
});
it("matches path boundaries and origin, never falls back on 404 or thrown errors", async () => {
  const network = vi.fn(async () => new Response("network"));
  globalThis.fetch = network;
  vi.stubGlobal("location", {
    href: "capacitor://localhost/",
    origin: "capacitor://localhost",
  });
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api/",
    worker: { fetch: () => new Response("missing", { status: 404 }) },
  });
  expect((await fetch("/api")).status).toBe(404);
  expect((await fetch("/api/items")).status).toBe(404);
  expect(await (await fetch("/apiary")).text()).toBe("network");
  expect(await (await fetch("https://other.example/api/items")).text()).toBe(
    "network",
  );
  expect(network).toHaveBeenCalledTimes(2);
});
it("preserves Request body, headers and init overrides", async () => {
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: {
      async fetch(req) {
        return Response.json({
          method: req.method,
          body: await req.text(),
          header: req.headers.get("x-test"),
          url: req.url,
        });
      },
    },
  });
  const request = new Request("https://api.example/api/items?q=1", {
    method: "POST",
    body: "hello",
  });
  expect(
    await (await fetch(request, { headers: { "x-test": "yes" } })).json(),
  ).toEqual({
    method: "POST",
    body: "hello",
    header: "yes",
    url: "https://api.example/api/items?q=1",
  });
});
it("aborted requests do not execute and handler errors reject", async () => {
  const handler = vi.fn(() => {
    throw new Error("failure");
  });
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: { fetch: handler },
  });
  await expect(
    fetch("https://api.example/api", { signal: AbortSignal.abort() }),
  ).rejects.toThrow();
  expect(handler).not.toHaveBeenCalled();
  await expect(fetch("https://api.example/api")).rejects.toThrow("failure");
});
it("prevents double installation and restores fetch", () => {
  const options = {
    baseURL: "https://api.example/api",
    worker: { fetch: () => new Response() },
  };
  runtime = capacitorWorkers(options);
  expect(() => capacitorWorkers(options)).toThrow("already installed");
  runtime.dispose();
  runtime.dispose();
  expect(globalThis.fetch).toBe(original);
});
it("rejects promptly when aborted while a handler is pending", async () => {
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: { fetch: () => new Promise<Response>(() => {}) },
  });
  const controller = new AbortController();
  const response = fetch("https://api.example/api", {
    signal: controller.signal,
  });
  controller.abort();
  await expect(response).rejects.toThrow();
});
it("keeps the configured origin for paths starting with two slashes", async () => {
  vi.stubGlobal("location", { href: "capacitor://localhost/" });
  runtime = capacitorWorkers({
    baseURL: "https://api.example/",
    worker: { fetch: (request) => Response.json({ url: request.url }) },
  });
  const response = await fetch("capacitor://localhost//other.example/path?q=1");
  expect(await response.json()).toEqual({
    url: "https://api.example//other.example/path?q=1",
  });
});
