import { Buffer } from "node:buffer";
import { IncomingMessage, ServerResponse, servers } from "./http.js";

export function httpServerHandler({ port }: { port: number }) {
  return {
    async fetch(request: Request): Promise<Response> {
      const server = servers.get(port);
      if (!server)
        throw new Error(
          `No Workers HTTP handler registered for logical port ${port}`,
        );
      const url = new URL(request.url);
      const req = new IncomingMessage();
      req.url = url.pathname + url.search;
      req.method = request.method;
      req.headers = Object.fromEntries(request.headers);
      req.headers.host = url.host;
      req.socket.encrypted = url.protocol === "https:";
      req.rawHeaders = Object.entries(req.headers).flat();
      const body = Buffer.from(await request.arrayBuffer());
      if (body.length && !req.headers["content-length"])
        req.headers["content-length"] = String(body.length);
      const res = new ServerResponse(req);
      return new Promise<Response>((resolve, reject) => {
        res.once("error", reject);
        req.once("error", reject);
        res.once("finish", () => {
          try {
            const headers = new Headers();
            for (const [key, value] of Object.entries(res.getHeaders())) {
              for (const item of Array.isArray(value) ? value : [value])
                headers.append(key, item);
            }
            resolve(
              new Response(
                request.method === "HEAD" ||
                  [204, 205, 304].includes(res.statusCode)
                  ? null
                  : Buffer.concat(res.chunks),
                {
                  status: res.statusCode,
                  statusText: res.statusMessage,
                  headers,
                },
              ),
            );
          } catch (error) {
            reject(error);
          }
        });
        server.emit("request", req, res);
        req.push(body.length ? body : null);
        if (body.length) req.push(null);
        req.complete = true;
      });
    },
  };
}
