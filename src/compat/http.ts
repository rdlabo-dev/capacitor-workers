// Limited server-side Node HTTP surface for Workers Express. No network implementation.
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { setImmediate, clearImmediate } from "node:timers";

// Express's router uses these globals. Only the Express compatibility module installs them.
if (!globalThis.setImmediate)
  Object.assign(globalThis, { setImmediate, clearImmediate });

export const METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
  "CONNECT",
  "TRACE",
];
export const STATUS_CODES: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  404: "Not Found",
  500: "Internal Server Error",
};

export class IncomingMessage extends Readable {
  url = "/";
  method = "GET";
  headers: Record<string, string> = {};
  rawHeaders: string[] = [];
  httpVersion = "1.1";
  httpVersionMajor = 1;
  httpVersionMinor = 1;
  complete = false;
  aborted = false;
  socket = Object.assign(new EventEmitter(), {
    encrypted: true,
    remoteAddress: "127.0.0.1",
    readable: true,
    writable: true,
  });
  connection = this.socket;
  _read() {}
}

export class ServerResponse extends Writable {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  finished = false;
  req: IncomingMessage;
  socket: IncomingMessage["socket"];
  private headerMap = new Map<string, string | string[]>();
  chunks: Buffer[] = [];
  constructor(req: IncomingMessage) {
    super();
    this.req = req;
    this.socket = req.socket;
  }
  setHeader(name: string, value: string | number | string[]) {
    this.headerMap.set(
      name.toLowerCase(),
      Array.isArray(value) ? value : String(value),
    );
    return this;
  }
  getHeader(name: string) {
    return this.headerMap.get(name.toLowerCase());
  }
  getHeaders() {
    return Object.fromEntries(this.headerMap);
  }
  getHeaderNames() {
    return [...this.headerMap.keys()];
  }
  hasHeader(name: string) {
    return this.headerMap.has(name.toLowerCase());
  }
  removeHeader(name: string) {
    this.headerMap.delete(name.toLowerCase());
  }
  writeHead(
    status: number,
    statusText?: string | Record<string, string>,
    headers?: Record<string, string>,
  ) {
    this.statusCode = status;
    if (typeof statusText === "string") this.statusMessage = statusText;
    for (const [key, value] of Object.entries(
      headers ?? (typeof statusText === "object" ? statusText : {}),
    ))
      this.setHeader(key, value);
    this.headersSent = true;
    return this;
  }
  _write(chunk: Buffer, _encoding: string, done: (error?: Error) => void) {
    this.headersSent = true;
    this.chunks.push(Buffer.from(chunk));
    done();
  }
  _final(done: () => void) {
    this.finished = true;
    this.headersSent = true;
    done();
  }
}

export type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => void;
export const servers = new Map<number, Server>();
export class Server extends EventEmitter {
  private port?: number;
  constructor(listener?: RequestListener) {
    super();
    if (listener) this.on("request", listener);
  }
  listen(port: number, ...args: unknown[]) {
    if (!Number.isInteger(port) || port < 0 || servers.has(port))
      throw new Error(`Invalid or duplicate logical port: ${port}`);
    this.port = port;
    servers.set(port, this);
    queueMicrotask(() => {
      this.emit("listening");
      const callback = args.at(-1);
      if (typeof callback === "function") callback();
    });
    return this;
  }
  address() {
    return this.port === undefined
      ? null
      : { port: this.port, address: "local", family: "IPv4" };
  }
  close(callback?: () => void) {
    if (this.port !== undefined) servers.delete(this.port);
    this.port = undefined;
    callback?.();
    return this;
  }
}
export const createServer = (listener: RequestListener) => new Server(listener);
export default {
  IncomingMessage,
  ServerResponse,
  Server,
  createServer,
  METHODS,
  STATUS_CODES,
};
