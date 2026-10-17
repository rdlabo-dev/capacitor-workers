// Limited server-side Node HTTP surface for Workers Express. No network implementation.
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { setImmediate, clearImmediate } from "node:timers";

// Express's router uses these globals. Only the Express compatibility module installs them.
if (!globalThis.setImmediate)
  Object.assign(globalThis, { setImmediate, clearImmediate });

// Public protocol constants observed in workerd 1.20261012.1.
export const METHODS = [
  "ACL",
  "BIND",
  "CHECKOUT",
  "CONNECT",
  "COPY",
  "DELETE",
  "GET",
  "HEAD",
  "LINK",
  "LOCK",
  "M-SEARCH",
  "MERGE",
  "MKACTIVITY",
  "MKCALENDAR",
  "MKCOL",
  "MOVE",
  "NOTIFY",
  "OPTIONS",
  "PATCH",
  "POST",
  "PROPFIND",
  "PROPPATCH",
  "PURGE",
  "PUT",
  "QUERY",
  "REBIND",
  "REPORT",
  "SEARCH",
  "SOURCE",
  "SUBSCRIBE",
  "TRACE",
  "UNBIND",
  "UNLINK",
  "UNLOCK",
  "UNSUBSCRIBE",
];
export const STATUS_CODES: Record<number, string> = {
  "100": "Continue",
  "101": "Switching Protocols",
  "102": "Processing",
  "103": "Early Hints",
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "203": "Non-Authoritative Information",
  "204": "No Content",
  "205": "Reset Content",
  "206": "Partial Content",
  "207": "Multi-Status",
  "208": "Already Reported",
  "226": "IM Used",
  "300": "Multiple Choices",
  "301": "Moved Permanently",
  "302": "Found",
  "303": "See Other",
  "304": "Not Modified",
  "305": "Use Proxy",
  "307": "Temporary Redirect",
  "308": "Permanent Redirect",
  "400": "Bad Request",
  "401": "Unauthorized",
  "402": "Payment Required",
  "403": "Forbidden",
  "404": "Not Found",
  "405": "Method Not Allowed",
  "406": "Not Acceptable",
  "407": "Proxy Authentication Required",
  "408": "Request Timeout",
  "409": "Conflict",
  "410": "Gone",
  "411": "Length Required",
  "412": "Precondition Failed",
  "413": "Payload Too Large",
  "414": "URI Too Long",
  "415": "Unsupported Media Type",
  "416": "Range Not Satisfiable",
  "417": "Expectation Failed",
  "418": "I'm a Teapot",
  "421": "Misdirected Request",
  "422": "Unprocessable Entity",
  "423": "Locked",
  "424": "Failed Dependency",
  "425": "Too Early",
  "426": "Upgrade Required",
  "428": "Precondition Required",
  "429": "Too Many Requests",
  "431": "Request Header Fields Too Large",
  "451": "Unavailable For Legal Reasons",
  "500": "Internal Server Error",
  "501": "Not Implemented",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
  "504": "Gateway Timeout",
  "505": "HTTP Version Not Supported",
  "506": "Variant Also Negotiates",
  "507": "Insufficient Storage",
  "508": "Loop Detected",
  "509": "Bandwidth Limit Exceeded",
  "510": "Not Extended",
  "511": "Network Authentication Required",
};

export function validateHeaderName(
  name: unknown,
  label = "Header name",
): asserts name is string {
  if (typeof name !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
    throw Object.assign(
      new TypeError(`${label} must be a valid HTTP token ["${String(name)}"]`),
      { code: "ERR_INVALID_HTTP_TOKEN" },
    );
}
export function validateHeaderValue(name: string, value: unknown): void {
  if (value === undefined)
    throw Object.assign(
      new TypeError(`Invalid value "undefined" for header "${name}"`),
      { code: "ERR_HTTP_INVALID_HEADER_VALUE" },
    );
  if (/[^\t\x20-\x7e\x80-\xff]/.test(String(value)))
    throw Object.assign(
      new TypeError(`Invalid character in header content ["${name}"]`),
      { code: "ERR_INVALID_CHAR" },
    );
}

export class IncomingMessage extends Readable {
  url = "/";
  method = "GET";
  headers: Record<string, string> = {};
  rawHeaders: string[] = [];
  httpVersion = "1.1";
  httpVersionMajor = 1;
  httpVersionMinor = 1;
  complete = false;
  cloudflare: { env?: unknown; ctx?: unknown; cf?: unknown } = {};
  aborted = false;
  socket = Object.assign(new EventEmitter(), {
    encrypted: false,
    localAddress: "127.0.0.1",
    localPort: 0,
    remoteAddress: "127.0.0.1",
    readable: true,
    writable: true,
  });
  connection = this.socket;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private reading = false;
  setBody(body: ReadableStream<Uint8Array> | null) {
    this.reader = body?.getReader();
  }
  _read() {
    if (this.reading) return;
    if (!this.reader) {
      this.complete = true;
      this.push(null);
      return;
    }
    this.reading = true;
    void this.reader.read().then(
      ({ value, done }) => {
        this.reading = false;
        if (this.destroyed) return;
        if (done) {
          this.complete = true;
          this.reader?.releaseLock();
          this.reader = undefined;
          this.push(null);
        } else if (this.push(Buffer.from(value))) this._read();
      },
      (error) => {
        this.reading = false;
        this.destroy(error);
      },
    );
  }
  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    if (!this.complete) {
      this.aborted = true;
      this.emit("aborted");
    }
    const reader = this.reader;
    this.reader = undefined;
    if (!reader) {
      callback(error);
      return;
    }
    void reader.cancel(error).then(
      () => {
        reader.releaseLock();
        callback(error);
      },
      () => {
        reader.releaseLock();
        callback(error);
      },
    );
  }
}

export class ServerResponse extends Writable {
  statusCode = 200;
  statusMessage = "unknown";
  headersSent = false;
  finished = false;
  req: IncomingMessage;
  socket: IncomingMessage["socket"];
  private headerMap = new Map<string, string | number | string[]>();
  readonly body: ReadableStream<Uint8Array>;
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private pending?: (error?: Error) => void;
  private bodyClosed = false;
  constructor(req: IncomingMessage) {
    super({ autoDestroy: true });
    this.req = req;
    this.socket = req.socket;
    this.body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
      pull: () => {
        const pending = this.pending;
        this.pending = undefined;
        pending?.();
      },
      cancel: (reason) => {
        this.bodyClosed = true;
        this.destroy(reason instanceof Error ? reason : undefined);
      },
    });
  }
  setHeader(name: string, value: string | number | string[]) {
    if (this.headersSent)
      throw Object.assign(
        new Error("Cannot set headers after they are sent to the client"),
        { code: "ERR_HTTP_HEADERS_SENT" },
      );
    validateHeaderName(name);
    for (const item of Array.isArray(value) ? value : [value])
      validateHeaderValue(name, item);
    this.headerMap.set(name.toLowerCase(), value);
    return this;
  }
  getHeader(name: string) {
    return this.headerMap.get(name.toLowerCase());
  }
  getHeaders() {
    return Object.assign(
      Object.create(null) as Record<string, string | number | string[]>,
      Object.fromEntries(this.headerMap),
    );
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
    if (this.headersSent)
      throw Object.assign(
        new Error("Cannot write headers after they are sent to the client"),
        { code: "ERR_HTTP_HEADERS_SENT" },
      );
    if (!Number.isInteger(status) || status < 100 || status > 999)
      throw Object.assign(new RangeError(`Invalid status code: ${status}`), {
        code: "ERR_HTTP_INVALID_STATUS_CODE",
      });
    this.statusCode = status;
    if (typeof statusText === "string") this.statusMessage = statusText;
    for (const [key, value] of Object.entries(
      headers ?? (typeof statusText === "object" ? statusText : {}),
    ))
      this.setHeader(key, value);
    this.flushHeaders();
    return this;
  }
  flushHeaders() {
    if (!this.headersSent) {
      this.headersSent = true;
      this.emit("headers");
    }
  }
  _write(chunk: Buffer, _encoding: string, done: (error?: Error) => void) {
    this.flushHeaders();
    if (this.destroyed) {
      done();
      return;
    }
    if (
      this.req.method === "HEAD" ||
      [204, 205, 304].includes(this.statusCode)
    ) {
      done();
      return;
    }
    this.controller.enqueue(new Uint8Array(chunk));
    if ((this.controller.desiredSize ?? 0) > 0) done();
    else this.pending = done;
  }
  _final(done: () => void) {
    this.finished = true;
    this.flushHeaders();
    if (!this.bodyClosed) {
      this.bodyClosed = true;
      this.controller.close();
    }
    done();
  }
  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    if (!this.bodyClosed) {
      this.bodyClosed = true;
      this.controller.error(error ?? new Error("Premature close"));
    }
    const pending = this.pending;
    this.pending = undefined;
    pending?.(error ?? new Error("Premature close"));
    callback(error);
  }
}

export type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => void;
export const servers = new Map<number, Server>();
let nextPort = 49152;
export class Server extends EventEmitter {
  private port?: number;
  constructor(listener?: RequestListener) {
    super();
    if (listener) this.on("request", listener);
  }
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event !== "request") return super.emit(event, ...args);
    const listeners = this.rawListeners(event);
    for (const listener of listeners) {
      const result = listener.apply(this, args) as unknown;
      if (result && typeof (result as PromiseLike<unknown>).then === "function")
        void Promise.resolve(result).catch((error) =>
          (args[1] as ServerResponse).destroy(error),
        );
    }
    return listeners.length !== 0;
  }
  get listening() {
    return this.port !== undefined;
  }
  listen(
    value?: number | string | { port?: number | string } | null | (() => void),
    ...args: unknown[]
  ) {
    if (this.listening)
      throw Object.assign(
        new Error(
          "Listen method has been called more than once without closing.",
        ),
        { code: "ERR_SERVER_ALREADY_LISTEN" },
      );
    const requested =
      typeof value === "object" && value !== null ? value.port : value;
    let port =
      requested == null || typeof requested === "function"
        ? 0
        : Number(requested);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw Object.assign(
        new Error(
          "options.port should be >= 0 and < 65536. Received " +
            typeof requested +
            ".",
        ),
        { code: "ERR_SOCKET_BAD_PORT" },
      );
    if (port === 0) {
      const start = nextPort;
      while (servers.has(nextPort)) {
        nextPort = nextPort === 65535 ? 49152 : nextPort + 1;
        if (nextPort === start)
          throw new Error("No available logical HTTP ports");
      }
      port = nextPort;
      nextPort = nextPort === 65535 ? 49152 : nextPort + 1;
    }
    if (servers.has(port)) throw new Error(`Duplicate logical port: ${port}`);
    this.port = port;
    servers.set(port, this);
    queueMicrotask(() => {
      this.emit("listening");
      const callback = args.at(-1) ?? value;
      if (typeof callback === "function") callback();
    });
    return this;
  }
  address() {
    return this.port === undefined
      ? null
      : { port: this.port, address: "127.0.0.1", family: "IPv4" };
  }
  close(callback?: () => void) {
    if (this.port !== undefined) servers.delete(this.port);
    this.port = undefined;
    if (callback) this.once("close", callback);
    queueMicrotask(() => this.emit("close"));
    return this;
  }
}
export const createServer = (listener?: RequestListener) =>
  new Server(listener);
export default {
  validateHeaderName,
  validateHeaderValue,
  IncomingMessage,
  ServerResponse,
  Server,
  createServer,
  METHODS,
  STATUS_CODES,
};
