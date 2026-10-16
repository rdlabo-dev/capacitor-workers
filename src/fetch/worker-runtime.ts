import { createIsolatedWorker } from "../isolated/bridge.js";
import { FetchRuntime, type FetchRuntimeOptions } from "./runtime.js";
import type { WorkerContext, WorkerFactory, WorkerHandler } from "./types.js";

export class DirectFetchRuntime<Env> extends FetchRuntime<Env> {
  constructor(
    options: FetchRuntimeOptions<Env>,
    private readonly worker: WorkerHandler<Env>,
  ) {
    super(options);
  }
  protected dispatch(request: Request, env: Env, ctx: WorkerContext) {
    return this.worker.fetch(request, env, ctx);
  }
}

export class IsolatedFetchRuntime<Env> extends FetchRuntime<Env> {
  private readonly isolated: ReturnType<typeof createIsolatedWorker<Env>>;
  override readonly ready: Promise<void>;
  constructor(options: FetchRuntimeOptions<Env>, factory: WorkerFactory) {
    super(options);
    this.isolated = createIsolatedWorker<Env>(factory());
    this.ready = this.isolated.ready;
  }
  protected dispatch(request: Request, env: Env, ctx: WorkerContext) {
    return this.isolated.handler.fetch(request, env, ctx);
  }
  protected override close() {
    this.isolated.dispose();
  }
}
