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

it("resolves relative URLs against document.baseURI and keeps the app origin boundary", async () => {
  vi.stubGlobal("location", { href: "https://localhost/screens/page" });
  vi.stubGlobal("document", { baseURI: "https://localhost/api/" });
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: { fetch: (req) => Response.json({ url: req.url }) },
  });
  expect(await (await fetch("items?q=1#fragment")).json()).toEqual({
    url: "https://api.example/api/items?q=1",
  });
});

it("rejects credentials instead of silently stripping them during URL mapping", async () => {
  const handler = vi.fn(() => new Response());
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: { fetch: handler },
  });
  await expect(fetch("https://user:password@api.example/api")).rejects.toThrow(
    TypeError,
  );
  expect(handler).not.toHaveBeenCalled();
});

it("does not invoke the handler if aborted before its scheduled invocation", async () => {
  const handler = vi.fn(() => new Response());
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: { fetch: handler },
  });
  const controller = new AbortController();
  const response = fetch("https://api.example/api", {
    signal: controller.signal,
  });
  const reason = new Error("cancelled before dispatch");
  controller.abort(reason);
  await expect(response).rejects.toBe(reason);
  expect(handler).not.toHaveBeenCalled();
});

it("removes and cancels a standard handler's HEAD body, preserving status and headers", async () => {
  const cancel = vi.fn();
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: {
      fetch: () =>
        new Response(new ReadableStream({ cancel }), {
          status: 202,
          headers: { "x-test": "kept" },
        }),
    },
  });
  const response = await fetch("https://api.example/api", { method: "HEAD" });
  expect(response.status).toBe(202);
  expect(response.headers.get("x-test")).toBe("kept");
  expect(response.body).toBeNull();
  expect(cancel).toHaveBeenCalledOnce();
});

it.each(["used", "locked", "error"])("rejects a %s response", async (kind) => {
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: {
      async fetch() {
        if (kind === "error") return Response.error();
        const response = new Response("body");
        if (kind === "used") await response.text();
        else response.body!.getReader();
        return response;
      },
    },
  });
  await expect(fetch("https://api.example/api")).rejects.toThrow(TypeError);
});

it("delegates outside requests unchanged, including Request identity and init", async () => {
  const network = vi.fn(async () => new Response("network"));
  globalThis.fetch = network;
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    worker: { fetch: () => new Response() },
  });
  const request = new Request("https://outside.example/api", {
    method: "POST",
    body: "body",
  });
  const init = { headers: { "x-test": "yes" } };
  await fetch(request, init);
  expect(network).toHaveBeenCalledWith(request, init);
  expect(request.bodyUsed).toBe(false);
});

it("keeps env identity and separate contexts while draining nested background work", async () => {
  const env = { value: "local" };
  const contexts = new Set();
  const completed: string[] = [];
  const errors = vi.fn();
  runtime = capacitorWorkers({
    baseURL: "https://api.example/api",
    env,
    onBackgroundError: errors,
    worker: {
      fetch(_req, received, ctx) {
        expect(received).toBe(env);
        contexts.add(ctx);
        ctx.waitUntil(
          Promise.resolve().then(() => {
            ctx.waitUntil(
              Promise.resolve().then(() => {
                completed.push("done");
              }),
            );
          }),
        );
        ctx.waitUntil(Promise.reject(new Error("background")));
        return new Response("ok");
      },
    },
  });
  await Promise.all([
    fetch("https://api.example/api"),
    fetch("https://api.example/api"),
  ]);
  await runtime.drain();
  expect(contexts.size).toBe(2);
  expect(completed).toHaveLength(2);
  expect(errors).toHaveBeenCalledTimes(2);
});
