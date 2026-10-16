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

/** Produced by the Vite plugin's ?capacitor-worker import. */
export type WorkerFactory = () => Worker;

export interface FetchRuntimeOptions<Env> {
  /** Absolute HTTP(S) URL. Its path is the interception boundary, not a prefix to append. */
  baseURL: string;
  /** Optional local values; never automatically copies server secrets. */
  env?: Env;
  onBackgroundError?: (error: unknown) => void;
}

export interface CapacitorWorkersOptions<Env> extends FetchRuntimeOptions<Env> {
  worker: WorkerHandler<Env> | WorkerFactory;
}
