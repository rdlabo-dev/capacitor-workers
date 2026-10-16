import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { capacitorWorkers } from "../../src/index";
let runtime: ReturnType<typeof capacitorWorkers> | undefined;
let native: ReturnType<typeof vi.fn>;
const worker = {
  fetch: async (request: Request) =>
    new Response((await request.text()) || "<!doctype html><h1>Worker</h1>", {
      headers: { "content-type": "text/html" },
    }),
};
const options = { baseURL: "https://worker.example", worker, render: "/" };
beforeEach(() => {
  native = vi.fn(async () => ({}));
  vi.stubGlobal("Capacitor", {
    getPlatform: () => "ios",
    isPluginAvailable: () => true,
    nativePromise: native,
  });
  vi.stubGlobal("location", new URL("capacitor://localhost/index.html"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(["/index.html", "/main.js"])),
  );
});
afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
  vi.unstubAllGlobals();
});
it("starts documents through the same public entry and keeps Worker routing", async () => {
  runtime = capacitorWorkers(options);
  await runtime.ready;
  expect(native).toHaveBeenCalledWith(
    "CapacitorWorkers",
    "start",
    expect.objectContaining({
      entry: "/",
      baseURL: options.baseURL,
      assets: ["/index.html", "/main.js"],
    }),
  );
  const dispatch = (globalThis as any).__capacitorWorkersDispatch;
  const result = await dispatch({
    url: "capacitor://localhost/api/echo",
    method: "POST",
    headers: {},
    body: btoa("payload"),
  });
  expect(atob(result.body)).toBe("payload");
  expect(result.url).toBe("https://worker.example/api/echo");
  await runtime.dispose();
  expect(native).toHaveBeenLastCalledWith("CapacitorWorkers", "stop", {});
  expect((globalThis as any).__capacitorWorkersDispatch).toBeUndefined();
});
it.each([
  "//remote.example/",
  "https://remote.example/",
  "/\\remote",
  "/\n/outside.example",
  "",
])("rejects invalid entry %s before changing fetch", (entry) => {
  const original = fetch;
  expect(() => capacitorWorkers({ ...options, render: entry })).toThrow(
    "local absolute path",
  );
  expect(fetch).toBe(original);
});
it("fails explicitly when native integration is missing", () => {
  vi.stubGlobal("Capacitor", {
    getPlatform: () => "ios",
    isPluginAvailable: () => false,
  });
  expect(() => capacitorWorkers(options)).toThrow("not installed");
});
it("restores fetch and releases native resources after startup failure", async () => {
  const original = fetch;
  native.mockRejectedValueOnce(new Error("Native failed"));
  runtime = capacitorWorkers(options);
  await expect(runtime.ready).rejects.toThrow("Native failed");
  expect(fetch).toBe(original);
  expect(native).toHaveBeenLastCalledWith("CapacitorWorkers", "stop", {});
  runtime = capacitorWorkers({ ...options, render: undefined });
  await runtime.ready;
});
it("disposes a pending start before allowing a new installation", async () => {
  let started!: () => void;
  let resolveStart!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  native.mockImplementationOnce(() => {
    started();
    return new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
  });
  runtime = capacitorWorkers(options);
  const ready = runtime.ready.catch((error) => error);
  await waiting;
  const stopping = runtime.dispose();
  expect(() => capacitorWorkers(options)).toThrow("already installed");
  resolveStart();
  await stopping;
  expect((await ready).message).toContain("disposed");
  runtime = capacitorWorkers({ ...options, render: undefined });
  await runtime.ready;
});
it("fails before native start if generated assets are missing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const original = fetch;
  runtime = capacitorWorkers(options);
  await expect(runtime.ready).rejects.toThrow("assets are missing");
  expect(native).not.toHaveBeenCalled();
  expect(fetch).toBe(original);
});
it("keeps redirects inside the Worker origin and preserves POST for 307", async () => {
  const seen: string[] = [];
  runtime = capacitorWorkers({
    ...options,
    worker: {
      async fetch(request) {
        seen.push(
          request.method +
            " " +
            new URL(request.url).pathname +
            " " +
            (await request.text()),
        );
        if (new URL(request.url).pathname === "/begin")
          return new Response(null, {
            status: 307,
            headers: { location: "/end" },
          });
        return new Response("done");
      },
    },
  });
  await runtime.ready;
  const dispatch = (globalThis as any).__capacitorWorkersDispatch;
  const result = await dispatch({
    url: "capacitor://localhost/begin",
    method: "POST",
    headers: {},
    body: btoa("payload"),
    follow: true,
  });
  expect(atob(result.body)).toBe("done");
  expect(seen).toEqual(["POST /begin payload", "POST /end payload"]);
  await expect(
    dispatch({
      url: "https://outside.example/secret",
      method: "GET",
      headers: {},
    }),
  ).rejects.toThrow("outside the local origin");
});
