import type { FetchRuntimeOptions, WorkerContext } from "./types.js";
export type { FetchRuntimeOptions } from "./types.js";

/** Shared Fetch contract. Subclasses implement execution, not URL or HTTP semantics. */
export abstract class FetchRuntime<Env = Record<string, unknown>> {
  private readonly base: URL;
  private readonly boundary: string;
  private readonly localURL: URL | undefined;
  private readonly original: typeof fetch;
  private readonly env: Env;
  private readonly pending = new Set<Promise<void>>();
  private disposed = false;
  readonly ready: Promise<void> = Promise.resolve();

  constructor(private readonly options: FetchRuntimeOptions<Env>) {
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

    this.base = base;
    this.boundary = base.pathname.replace(/\/+$/, "");
    this.original = globalThis.fetch;
    this.localURL = globalThis.location
      ? new URL(globalThis.location.href)
      : undefined;
    this.env = options.env ?? ({} as Env);
  }

  protected abstract dispatch(
    request: Request,
    env: Env,
    ctx: WorkerContext,
  ): Response | Promise<Response>;
  protected close(): void {}

  /** Bound function; creating a runtime does not patch global fetch. */
  readonly fetch: typeof fetch = async (input, init) => {
    const isRequest = input instanceof Request;
    const address = isRequest ? input.url : String(input);
    const url = new URL(
      address,
      globalThis.document?.baseURI ??
        globalThis.location?.href ??
        this.base.href,
    );
    const matchesPath =
      !this.boundary ||
      url.pathname === this.boundary ||
      url.pathname.startsWith(`${this.boundary}/`);
    const isLocal =
      this.localURL &&
      url.protocol === this.localURL.protocol &&
      url.host === this.localURL.host;
    if (!matchesPath || (url.origin !== this.base.origin && !isLocal)) {
      return this.original.call(globalThis, input, init);
    }
    if (url.username || url.password)
      throw new TypeError("Request URL must not contain credentials.");
    const target = new URL(this.base.origin);
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
      waitUntil: (promise) => {
        const tracked = Promise.resolve(promise).then(
          () => {},
          (error) => {
            try {
              (this.options.onBackgroundError ?? console.error)(error);
            } catch (reportError) {
              console.error(reportError);
            }
          },
        );
        this.pending.add(tracked);
        void tracked.finally(() => this.pending.delete(tracked));
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
          return this.dispatch(request, this.env, ctx);
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

  async drain() {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  dispose() {
    if (this.disposed) return;
    this.close();
    this.disposed = true;
  }
}
