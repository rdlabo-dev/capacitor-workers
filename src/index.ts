export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props: Record<string, unknown>;
}

export interface WorkerHandler<Env = Record<string, unknown>> {
  fetch(
    request: Request,
    env: Env,
    ctx: WorkerContext,
  ): Response | Promise<Response>;
}

export interface CapacitorWorkersOptions<Env> {
  worker: WorkerHandler<Env>;
  /** Absolute HTTP(S) URL. Its path is the interception boundary, not a prefix to append. */
  baseURL: string;
  /** Optional local values; never automatically copies server secrets. */
  env?: Env;
  onBackgroundError?: (error: unknown) => void;
}

let installed = false;

/** Installs synchronously; await is optional. Does not start a server. */
export function capacitorWorkers<Env = Record<string, unknown>>(
  options: CapacitorWorkersOptions<Env>,
) {
  if (installed)
    throw new Error("capacitorWorkers is already installed; dispose it first.");
  const base = new URL(options.baseURL);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new TypeError(
      "baseURL must be an HTTP(S) URL without credentials, query or fragment.",
    );
  }
  if (typeof options.worker?.fetch !== "function")
    throw new TypeError("worker.fetch is required.");
  const boundary = base.pathname.replace(/\/+$/, "");
  const original = globalThis.fetch;
  const localURL = globalThis.location
    ? new URL(globalThis.location.href)
    : undefined;
  const pending = new Set<Promise<void>>();
  const env = options.env ?? ({} as Env);
  const wrapped: typeof fetch = async (input, init) => {
    const isRequest = input instanceof Request;
    const address = isRequest ? input.url : String(input);
    const url = new URL(
      address,
      globalThis.document?.baseURI ?? globalThis.location?.href ?? base.href,
    );
    const matchesPath =
      !boundary ||
      url.pathname === boundary ||
      url.pathname.startsWith(`${boundary}/`);
    const isLocal =
      localURL &&
      url.protocol === localURL.protocol &&
      url.host === localURL.host;
    if (!matchesPath || (url.origin !== base.origin && !isLocal)) {
      return original.call(globalThis, input, init);
    }
    if (url.username || url.password)
      throw new TypeError("Request URL must not contain credentials.");
    const target = new URL(base.origin);
    target.pathname = url.pathname;
    target.search = url.search;
    const request = isRequest
      ? new Request(target, new Request(input, init))
      : new Request(target, init);
    request.signal.throwIfAborted();
    const ctx: WorkerContext = {
      props: {},
      passThroughOnException() {
        throw new Error(
          "passThroughOnException is unsupported for local execution.",
        );
      },
      waitUntil(promise) {
        const tracked = Promise.resolve(promise).then(
          () => {},
          (error) => {
            try {
              (options.onBackgroundError ?? console.error)(error);
            } catch (reportError) {
              console.error(reportError);
            }
          },
        );
        pending.add(tracked);
        void tracked.finally(() => pending.delete(tracked));
      },
    };
    let abort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(request.signal.reason);
      request.signal.addEventListener("abort", abort, { once: true });
    });
    let response: Response;
    try {
      response = await Promise.race([
        Promise.resolve().then(() => {
          request.signal.throwIfAborted();
          return options.worker.fetch(request, env, ctx);
        }),
        cancelled,
      ]);
    } finally {
      request.signal.removeEventListener("abort", abort);
    }
    if (!(response instanceof Response))
      throw new TypeError("worker.fetch must return a Response.");
    if (response.type === "error")
      throw new TypeError("worker.fetch returned a network error response.");
    if (response.bodyUsed || response.body?.locked)
      throw new TypeError("worker.fetch returned an unusable response body.");
    if (request.method === "HEAD" && response.body) {
      void response.body.cancel().catch(() => {});
      return new Response(null, response);
    }
    return response;
  };
  globalThis.fetch = wrapped;
  installed = true;
  let disposed = false;
  return {
    async drain() {
      while (pending.size) await Promise.all([...pending]);
    },
    dispose() {
      if (disposed) return;
      if (globalThis.fetch !== wrapped)
        throw new Error(
          "fetch changed after installation; restore it before disposing.",
        );
      globalThis.fetch = original;
      installed = false;
      disposed = true;
    },
  };
}
