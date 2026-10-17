import { getHostCall } from "./host-call.js";
import type { NativeConnection, NativeNetwork } from "./transport.js";

export type NativeNetworkMethod =
  | "socketWatch"
  | "socketOpen"
  | "socketWrite"
  | "socketEnd"
  | "socketRead"
  | "socketClose"
  | "networkOpen"
  | "networkWrite"
  | "networkEnd"
  | "networkRead"
  | "networkClose";

/**
 * Narrowly typed bridge call. The same shape can be relayed through a Capacitor
 * bridge, a Dedicated Worker MessagePort, or the Android document-host
 * JavaScript interface.
 */
export type NativeCall = (
  plugin: string,
  method: NativeNetworkMethod,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface NativeNetworkOptions {
  /** Maximum number of bytes requested per `read()` (default 65536). */
  chunkSize?: number;
  /** Bridge call function; defaults to `globalThis.Capacitor.nativePromise`. */
  nativeCall?: NativeCall;
}

interface HeadersResult {
  status: number;
  statusText: string;
  headers: [string, string][];
  hasBody: boolean;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

let overrideCall: NativeCall | undefined;
export function setNativeCall(call: NativeCall | undefined) {
  const previous = overrideCall;
  overrideCall = call;
  return () => {
    if (overrideCall === call) overrideCall = previous;
  };
}

/** Native bridge detection; ordinary browsers retain their browser transport. */
export function getNativeCall(): NativeCall | undefined {
  if (overrideCall) return overrideCall;
  const host = getHostCall();
  if (host) return host;
  const bridge = (
    globalThis as typeof globalThis & {
      Capacitor?: { nativePromise?: NativeCall; isNativePlatform?(): boolean };
    }
  ).Capacitor;
  if (!bridge?.nativePromise || bridge.isNativePlatform?.() === false) return;
  return bridge.nativePromise.bind(bridge);
}
function defaultNativeCall(): NativeCall {
  const call = getNativeCall();
  if (!call) throw new Error("Capacitor native bridge is not available");
  return call;
}

const CHUNK_SIZE = 65536;

function chunkToBase64(chunk: Uint8Array): string {
  const step = 0x8000;
  let binary = "";
  for (let i = 0; i < chunk.length; i += step) {
    binary += String.fromCharCode(...chunk.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToChunk(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function validateRequest(
  request: Omit<
    import("./transport.js").TransportRequest,
    "body" | "signal"
  > & {
    hasBody: boolean;
  },
): void {
  const url = new URL(request.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("Network transport only supports HTTP(S) URLs");
  }
  if (request.method.length === 0) {
    throw new TypeError("Request method must not be empty");
  }
  if (/[\r\n]/.test(request.method)) {
    throw new TypeError("Request method contains line breaks");
  }
  for (const [name, value] of request.headers) {
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
      throw new TypeError(
        `Header ${JSON.stringify(name)} contains line breaks`,
      );
    }
  }
}

function parseHeadersResult(value: unknown): HeadersResult {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Invalid headers response from native network");
  }
  const result = value as Record<string, unknown>;
  if (
    typeof result.status !== "number" ||
    typeof result.statusText !== "string" ||
    typeof result.hasBody !== "boolean"
  ) {
    throw new TypeError("Invalid headers response from native network");
  }
  if (!Array.isArray(result.headers)) {
    throw new TypeError("Invalid headers response from native network");
  }
  const headers: [string, string][] = [];
  for (const entry of result.headers) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      typeof entry[1] !== "string"
    ) {
      throw new TypeError("Invalid header entry from native network");
    }
    headers.push([entry[0], entry[1]]);
  }
  return {
    status: result.status,
    statusText: result.statusText,
    headers,
    hasBody: result.hasBody,
  };
}

class CapacitorNativeConnection implements NativeConnection {
  readonly headers: Promise<HeadersResult>;
  private readonly id: string;
  private readonly call: NativeCall;
  private readonly chunkSize: number;
  private closed = false;
  private closing?: Promise<void>;
  private released = false;
  private resolveHeaders!: (value: HeadersResult) => void;
  private rejectHeaders!: (reason: unknown) => void;

  constructor(id: string, call: NativeCall, chunkSize: number) {
    this.id = id;
    this.call = call;
    this.chunkSize = chunkSize;
    this.headers = new Promise<HeadersResult>((resolve, reject) => {
      this.resolveHeaders = resolve;
      this.rejectHeaders = reject;
    });
    // A caller can cancel before it starts awaiting headers.
    void this.headers.catch(() => {});
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Network connection is closed");
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("Write chunk must be a Uint8Array");
    }
    for (let offset = 0; offset < chunk.byteLength; offset += CHUNK_SIZE) {
      if (this.closed) throw new Error("Network connection is closed");
      await this.call("CapacitorWorkers", "networkWrite", {
        id: this.id,
        chunk: chunkToBase64(chunk.subarray(offset, offset + CHUNK_SIZE)),
      });
    }
  }

  async end(): Promise<void> {
    if (this.closed) throw new Error("Network connection is closed");
    await this.call("CapacitorWorkers", "networkEnd", { id: this.id });
  }

  async read(): Promise<Uint8Array<ArrayBuffer> | null> {
    if (this.released) return null;
    const result = await this.call("CapacitorWorkers", "networkRead", {
      id: this.id,
      maxBytes: this.chunkSize,
    });
    if (typeof result !== "object" || result === null) {
      throw new TypeError("Invalid read response from native network");
    }
    const data = result as Record<string, unknown>;
    if (data.eof === true) {
      this.released = true;
      return null;
    }
    if (typeof data.chunk !== "string") {
      throw new TypeError("Invalid read response from native network");
    }
    return base64ToChunk(data.chunk);
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.released = true;
    this.rejectHeaders(new Error("Network connection is closed"));
    this.closing = Promise.resolve()
      .then(() =>
        this.call("CapacitorWorkers", "networkClose", { id: this.id }),
      )
      .then(() => undefined);
    return this.closing;
  }

  settleHeaders(result: unknown): void {
    try {
      this.resolveHeaders(parseHeadersResult(result));
    } catch (error) {
      this.rejectHeaders(error);
    }
  }

  failHeaders(reason: unknown): void {
    this.rejectHeaders(reason);
  }
}

export function createNativeNetwork(
  options: NativeNetworkOptions = {},
): NativeNetwork {
  const call = options.nativeCall ?? defaultNativeCall();
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize <= 0 ||
    chunkSize > CHUNK_SIZE
  ) {
    throw new TypeError("chunkSize must be an integer between 1 and 65536");
  }

  return {
    async open(request): Promise<NativeConnection> {
      validateRequest(request);
      const id = randomId();
      const connection = new CapacitorNativeConnection(id, call, chunkSize);
      const { encodeResponseBody } = request;
      const opening = call("CapacitorWorkers", "networkOpen", {
        id,
        url: request.url,
        method: request.method,
        headers: request.headers,
        hasBody: request.hasBody,
        encodeResponseBody,
      });
      opening.then(
        (result) => connection.settleHeaders(result),
        (reason) => {
          connection.failHeaders(reason);
          void connection.close().catch(() => {});
        },
      );
      return connection;
    },
  };
}

/** Default native network using the Capacitor host bridge. */
export const nativeNetwork: NativeNetwork = {
  open(request) {
    return createNativeNetwork().open(request);
  },
};
