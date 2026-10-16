import { createFetchRuntime } from "./fetch/worker-runtime.js";
import type { CapacitorWorkersOptions } from "./fetch/types.js";
export type {
  CapacitorWorkersOptions,
  WorkerContext,
  WorkerFactory,
  WorkerHandler,
} from "./fetch/types.js";
export { FetchRuntime, type FetchRuntimeOptions } from "./fetch/runtime.js";

let installed = false;

/** Installs synchronously; await is optional. Does not start a server. */
export function capacitorWorkers<Env = Record<string, unknown>>(
  options: CapacitorWorkersOptions<Env>,
) {
  if (installed)
    throw new Error("capacitorWorkers is already installed; dispose it first.");
  const original = globalThis.fetch;
  const runtime = createFetchRuntime(options);
  globalThis.fetch = runtime.fetch;
  installed = true;
  let disposed = false;
  return {
    ready: runtime.ready,
    drain: () => runtime.drain(),
    dispose() {
      if (disposed) return;
      if (globalThis.fetch !== runtime.fetch)
        throw new Error(
          "fetch changed after installation; restore it before disposing.",
        );
      runtime.dispose();
      globalThis.fetch = original;
      installed = false;
      disposed = true;
    },
  };
}
