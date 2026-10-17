import { expect, it } from "vitest";
import { createServer } from "../http/index";
import { httpServerHandler } from "./index";

it("rejects invalid asynchronous response headers instead of leaving fetch pending", async () => {
  const server = createServer(async (_request, response) => {
    await Promise.resolve();
    response.setHeader("bad\nname", "value");
    response.end("body");
  }).listen(3019);
  try {
    await expect(
      httpServerHandler({ port: 3019 }).fetch(
        new Request("https://example.test/"),
      ),
    ).rejects.toThrow();
  } finally {
    server.close();
  }
});

it("accepts a server and starts it once with an automatically assigned logical port", async () => {
  const server = createServer((request, response) => response.end(request.url));
  const handler = httpServerHandler(server);
  const address = server.address();
  try {
    expect(server.listening).toBe(true);
    expect(address?.port).toBeGreaterThanOrEqual(49152);
    expect(server.address()).toEqual(address);
    expect(
      await (
        await handler.fetch(new Request("https://example.test/path?q=1"))
      ).text(),
    ).toBe("/path?q=1");
    httpServerHandler(server);
    expect(server.address()).toEqual(address);
  } finally {
    server.close();
  }
});

it("accepts numeric and object descriptors and dispatches through the same registry", async () => {
  const { handleAsNodeRequest } = await import("./index");
  const server = createServer((_request, response) =>
    response.end("ok"),
  ).listen(3020);
  try {
    for (const descriptor of [3020, { port: 3020 }]) {
      expect(
        await (
          await httpServerHandler(descriptor).fetch(
            new Request("https://example.test/"),
          )
        ).text(),
      ).toBe("ok");
      expect(
        await (
          await handleAsNodeRequest(
            descriptor,
            new Request("https://example.test/"),
          )
        ).text(),
      ).toBe("ok");
    }
  } finally {
    server.close();
  }
  await expect(
    handleAsNodeRequest(3020, new Request("https://example.test/")),
  ).rejects.toMatchObject({ code: "ERR_INVALID_ARG_VALUE" });
});

it("validates descriptors at handler creation and rejects invalid dispatch ports", async () => {
  const { handleAsNodeRequest } = await import("./index");
  for (const descriptor of [-1, 65536, NaN, Infinity, {}, { port: null }]) {
    expect(() => httpServerHandler(descriptor)).toThrow(
      "Failed to determine port for server",
    );
    await expect(
      handleAsNodeRequest(descriptor, new Request("https://example.test/")),
    ).rejects.toThrow("Failed to determine port for server");
  }
  expect(() => httpServerHandler(null!)).toThrow(
    "Server descriptor cannot be null or undefined",
  );
  // The bridge validates finite range; Server.listen owns integer validation.
  expect(() => httpServerHandler(1.5)).not.toThrow();
});

it("assigns different ports to zero/omitted listeners and preserves explicit overloads", () => {
  const servers = [
    createServer(() => {}),
    createServer(() => {}),
    createServer(() => {}),
  ];
  try {
    servers[0].listen();
    servers[1].listen(0);
    servers[2].listen({ port: "3021" });
    expect(servers[0].address()?.port).not.toBe(servers[1].address()?.port);
    expect(servers[2].address()?.port).toBe(3021);
    expect(() => servers[0].listen()).toThrow();
  } finally {
    for (const server of servers) server.close();
  }
  for (const port of [-1, 65536, 1.5]) {
    expect(() => createServer(() => {}).listen(port)).toThrow(
      expect.objectContaining({ code: "ERR_SOCKET_BAD_PORT" }),
    );
  }
});

it("dispatches before the upload ends and streams the response before end", async () => {
  let upload!: ReadableStreamDefaultController<Uint8Array>;
  let response!: import("../http/index").ServerResponse;
  const server = createServer((_request, res) => {
    response = res;
    res.write("first");
  });
  const request = new Request("https://example.test/", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        upload = controller;
      },
    }),
    duplex: "half",
  } as RequestInit);
  try {
    const result = await httpServerHandler(server).fetch(request);
    const reader = result.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    response.end("last");
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("last");
    expect((await reader.read()).done).toBe(true);
  } finally {
    upload.close();
    server.close();
  }
});

it("preserves Cloudflare dispatch context and drains an incremental request body", async () => {
  const env = { value: 1 },
    ctx = { waitUntil() {} };
  const server = createServer((req, res) => {
    expect(req.cloudflare).toEqual({ env, ctx });
    expect(req.headers.host).toBe("example.test");
    expect(req.headers["transfer-encoding"]).toBe("chunked");
    expect(req.complete).toBe(false);
    req.pipe(res);
  });
  try {
    const result = await httpServerHandler(server).fetch(
      new Request("https://example.test/", { method: "POST", body: "upload" }),
      env,
      ctx,
    );
    expect(await result.text()).toBe("upload");
  } finally {
    server.close();
  }
});

it("propagates rejected async handlers instead of leaving the request pending", async () => {
  const server = createServer(async () => {
    await Promise.resolve();
    throw new Error("handler failed");
  });
  try {
    await expect(
      httpServerHandler(server).fetch(new Request("https://example.test/")),
    ).rejects.toThrow("handler failed");
  } finally {
    server.close();
  }
});

it("propagates response errors after headers to the body reader", async () => {
  let response!: import("../http/index").ServerResponse;
  const server = createServer((_req, res) => {
    response = res;
    res.flushHeaders();
  });
  try {
    const result = await httpServerHandler(server).fetch(
      new Request("https://example.test/"),
    );
    response.destroy(new Error("body failed"));
    await expect(result.text()).rejects.toThrow("body failed");
  } finally {
    server.close();
  }
});

it("cancels and unlocks an unread upload after an early response", async () => {
  let cancelled = false;
  const upload = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://example.test/", {
    method: "POST",
    body: upload,
    duplex: "half",
  } as RequestInit);
  const server = createServer((_req, res) => res.end("early"));
  try {
    const response = await httpServerHandler(server).fetch(request);
    expect(await response.text()).toBe("early");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
    expect(request.body!.locked).toBe(false);
  } finally {
    server.close();
  }
});

it("fails the response body and unlocks the reader when an upload fails after headers", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const request = new Request("https://example.test/", {
    method: "POST",
    duplex: "half",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
    }),
  } as RequestInit);
  const server = createServer((req, res) => {
    res.flushHeaders();
    req.resume();
  });
  try {
    const response = await httpServerHandler(server).fetch(request);
    source.error(new Error("upload broke"));
    await expect(response.text()).rejects.toThrow("upload broke");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request.body!.locked).toBe(false);
  } finally {
    server.close();
  }
});

it("cancels the request upload when the response reader is cancelled", async () => {
  let cancelled = false;
  const request = new Request("https://example.test/", {
    method: "POST",
    duplex: "half",
    body: new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    }),
  } as RequestInit);
  const server = createServer((_req, res) => {
    res.flushHeaders();
  });
  try {
    const response = await httpServerHandler(server).fetch(request);
    await response.body!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
    expect(request.body!.locked).toBe(false);
  } finally {
    server.close();
  }
});
