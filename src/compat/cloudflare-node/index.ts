import { IncomingMessage, ServerResponse, servers } from "../http/index.js";

export interface ServerDescriptor {
  port?: number | null;
}
export interface NodeStyleServer {
  listen(): unknown;
  address(): { port?: number | null } | string | null;
}

function validatePort(port: unknown): number {
  if (
    typeof port !== "number" ||
    !Number.isFinite(port) ||
    port < 0 ||
    port > 65535
  )
    throw new Error("Failed to determine port for server");
  return port;
}

export function httpServerHandler(
  descriptor: number | ServerDescriptor | NodeStyleServer,
) {
  if (descriptor == null)
    throw new Error("Server descriptor cannot be null or undefined");
  let port: unknown =
    typeof descriptor === "number"
      ? descriptor
      : (descriptor as ServerDescriptor).port;
  if (
    port == null &&
    typeof (descriptor as NodeStyleServer).listen === "function"
  ) {
    const server = descriptor as NodeStyleServer;
    let address = server.address();
    port = typeof address === "object" ? address?.port : undefined;
    if (typeof port !== "number") {
      server.listen();
      address = server.address();
      port = typeof address === "object" ? address?.port : undefined;
    }
  }
  const resolvedPort = validatePort(port);
  return {
    fetch(request: Request, env?: unknown, ctx?: unknown): Promise<Response> {
      return handleAsNodeRequest(resolvedPort, request, env, ctx);
    },
  };
}

export async function handleAsNodeRequest(
  descriptor: number | ServerDescriptor,
  request: Request,
  env?: unknown,
  ctx?: unknown,
): Promise<Response> {
  const port = validatePort(
    typeof descriptor === "number" ? descriptor : descriptor?.port,
  );
  const server = servers.get(port);
  if (!server)
    throw Object.assign(
      new Error(
        `Http server with port ${port} not found. This is likely a bug with your code. ` +
          `You should check if server.listen() was called with the same port (${port})`,
      ),
      { code: "ERR_INVALID_ARG_VALUE" },
    );
  const url = new URL(request.url);
  const req = new IncomingMessage();
  req.url = url.pathname + url.search;
  req.method = request.method;
  req.headers = Object.fromEntries(request.headers);
  // Local dispatch has no HTTP stack to supply transport headers. Preserve the
  // logical origin and indicate a streaming entity to Node body parsers.
  req.headers.host ??= url.host;
  if (
    request.body &&
    !req.headers["content-length"] &&
    !req.headers["transfer-encoding"]
  )
    req.headers["transfer-encoding"] = "chunked";
  req.socket.encrypted = url.protocol === "https:";
  req.socket.localPort = port;
  req.rawHeaders = Object.entries(req.headers).flat();
  req.cloudflare = { env, ctx };
  if ("cf" in request) req.cloudflare.cf = request.cf;
  req.setBody(request.body);
  const res = new ServerResponse(req);
  return new Promise<Response>((resolve, reject) => {
    res.once("error", reject);
    req.once("error", (error) => {
      reject(error);
      res.destroy(error);
    });
    res.once("finish", () => {
      request.signal.removeEventListener("abort", onAbort);
      if (!req.complete) req.destroy();
    });
    res.once("headers", () => {
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.getHeaders())) {
          for (const item of Array.isArray(value) ? value : [value])
            headers.append(key, String(item));
        }
        resolve(
          new Response(
            request.method === "HEAD" ||
              [204, 205, 304].includes(res.statusCode)
              ? null
              : res.body,
            {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers,
            },
          ),
        );
      } catch (error) {
        reject(error);
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    });
    const onAbort = () => {
      const reason = request.signal.reason;
      const error =
        reason instanceof Error
          ? reason
          : new Error("The operation was aborted", { cause: reason });
      req.destroy(error);
      res.destroy(error);
    };
    res.once("close", () => {
      request.signal.removeEventListener("abort", onAbort);
      if (!req.complete) req.destroy();
      if (!res.finished) reject(new Error("Premature close"));
    });
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) {
      onAbort();
      return;
    }
    try {
      server.emit("connection", server, req);
      server.emit("request", req, res);
    } catch (error) {
      res.destroy(error instanceof Error ? error : new Error(String(error)));
      reject(error);
    }
  });
}
