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

/** Supplied by a build plugin or explicit ESM wiring; direct code loads only when selected. */
export interface WorkerSource<Env = Record<string, unknown>> {
  createWorker: WorkerFactory;
  loadDirect(): Promise<WorkerHandler<Env>>;
}
export type ExecutionPreference = "worker" | "direct";

export interface CapacitorWorkersOptions<Env> extends FetchRuntimeOptions<Env> {
  /** Optional when configured by the Vite or esbuild plugin. */
  worker?: WorkerHandler<Env> | WorkerFactory | WorkerSource<Env>;
  /** Applies to a configured WorkerSource; defaults to worker. */
  prefer?: ExecutionPreference;
}
