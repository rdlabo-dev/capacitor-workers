import { createServer } from "node:http";
import { httpServerHandler, handleAsNodeRequest } from "cloudflare:node";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

const api = { createServer, httpServerHandler, handleAsNodeRequest };
export const nodeHttpFeature = defineFeature<typeof api>()("node.http", [
  "serverDescriptor",
  "portDescriptors",
  "invalidDescriptor",
  "ephemeralPorts",
  "closeLifecycle",
  "streamResponse",
  "streamRequest",
  "asyncFailure",
  "dispatchContext",
]);
function equal(value: unknown, expected: unknown) {
  if (JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(value)} != ${JSON.stringify(expected)}`);
}
async function rejects(
  operation: () => unknown,
  code?: string,
  message?: string,
) {
  try {
    await operation();
  } catch (error) {
    if (code) equal((error as { code?: string }).code, code);
    if (message) equal((error as Error).message, message);
    return;
  }
  throw new Error("Expected rejection");
}
// The receiving contract is completion evidence, not a declaration that the
// entire node:http module is supported. Client APIs still need their contracts.
export const nodeHttpContract: ContractSuite<typeof nodeHttpFeature> = {
  feature: nodeHttpFeature,
  cases: {
    async serverDescriptor({ createServer, httpServerHandler }) {
      const server = createServer((req, res) => res.end(req.url));
      try {
        const handler = httpServerHandler(server);
        equal(server.listening, true);
        equal(
          await (
            await handler.fetch(new Request("https://example.test/path?q=1"))
          ).text(),
          "/path?q=1",
        );
        const first = server.address();
        httpServerHandler(server);
        equal(server.address(), first);
      } finally {
        server.close();
      }
    },
    async portDescriptors({
      createServer,
      httpServerHandler,
      handleAsNodeRequest,
    }) {
      const server = createServer((_req, res) => res.end("ok")).listen();
      const port = (server.address() as { port: number }).port;
      try {
        for (const descriptor of [port, { port }]) {
          equal(
            await (
              await httpServerHandler(descriptor).fetch(
                new Request("https://example.test/"),
              )
            ).text(),
            "ok",
          );
          equal(
            await (
              await handleAsNodeRequest(
                descriptor,
                new Request("https://example.test/"),
              )
            ).text(),
            "ok",
          );
        }
      } finally {
        server.close();
      }
      await rejects(
        () => handleAsNodeRequest(port, new Request("https://example.test/")),
        "ERR_INVALID_ARG_VALUE",
      );
    },
    async invalidDescriptor({ httpServerHandler, handleAsNodeRequest }) {
      for (const descriptor of [-1, 65536, NaN, Infinity, {}, { port: null }]) {
        await rejects(() => httpServerHandler(descriptor));
        await rejects(() =>
          handleAsNodeRequest(descriptor, new Request("https://example.test/")),
        );
      }
      await rejects(() => httpServerHandler(null!));
      httpServerHandler(1.5);
    },
    async ephemeralPorts({ createServer }) {
      const a = createServer().listen(),
        b = createServer().listen(0);
      try {
        const first = a.address() as { port: number };
        const second = b.address() as { port: number };
        equal(first.port !== second.port, true);
        equal(first.port >= 49152 && second.port <= 65535, true);
        await rejects(() => a.listen(), "ERR_SERVER_ALREADY_LISTEN");
      } finally {
        a.close();
        b.close();
      }
    },
    async closeLifecycle({ createServer }) {
      const server = createServer().listen();
      const order: string[] = [];
      server.on("close", () => order.push("close"));
      server.close(() => order.push("callback"));
      order.push("return");
      equal(server.listening, false);
      equal(server.address(), null);
      await Promise.resolve();
      equal(order, ["return", "close", "callback"]);
    },
    async streamResponse({ createServer, httpServerHandler }) {
      let finish!: () => void;
      const server = createServer((_req, res) => {
        res.write("first");
        finish = () => {
          res.end("last");
        };
      });
      try {
        const response = await httpServerHandler(server).fetch(
          new Request("https://example.test/"),
        );
        const reader = response.body!.getReader();
        equal(new TextDecoder().decode((await reader.read()).value), "first");
        finish();
        equal(new TextDecoder().decode((await reader.read()).value), "last");
        equal((await reader.read()).done, true);
      } finally {
        server.close();
      }
    },
    async streamRequest({ createServer, httpServerHandler }) {
      const server = createServer((req, res) => req.pipe(res));
      try {
        const response = await httpServerHandler(server).fetch(
          new Request("https://example.test/", {
            method: "POST",
            body: "upload",
          }),
        );
        equal(await response.text(), "upload");
      } finally {
        server.close();
      }
    },
    async asyncFailure({ createServer, httpServerHandler }) {
      const server = createServer(async () => {
        await Promise.resolve();
        throw new Error("async handler");
      });
      try {
        await rejects(
          () =>
            httpServerHandler(server).fetch(
              new Request("https://example.test/"),
            ),
          undefined,
          "async handler",
        );
      } finally {
        server.close();
      }
    },
    async dispatchContext({ createServer, httpServerHandler }) {
      const env = { key: 1 },
        ctx = {};
      const server = createServer((req, res) => {
        const cloudflare = (
          req as unknown as { cloudflare: { env: unknown; ctx: unknown } }
        ).cloudflare;
        equal(cloudflare.env === env, true);
        equal(cloudflare.ctx === ctx, true);
        res.end("ok");
      });
      try {
        equal(
          await (
            await httpServerHandler(server).fetch(
              new Request("https://example.test/"),
              env,
              ctx,
            )
          ).text(),
          "ok",
        );
      } finally {
        server.close();
      }
    },
  },
};
const supported = { status: "supported" } as const;
export class NodeHttp extends FeatureImplementation<typeof nodeHttpFeature> {
  constructor() {
    super(nodeHttpFeature, {
      serverDescriptor: supported,
      portDescriptors: supported,
      invalidDescriptor: supported,
      ephemeralPorts: supported,
      closeLifecycle: supported,
      streamResponse: supported,
      streamRequest: supported,
      asyncFailure: supported,
      dispatchContext: supported,
    });
  }
  create() {
    return api;
  }
}
