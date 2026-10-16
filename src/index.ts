import { startRendering, validateRendering } from "./documents/runtime.js";
import { createFetchRuntime } from "./fetch/worker-runtime.js";
import type { CapacitorWorkersOptions } from "./fetch/types.js";
export type {
  CapacitorWorkersOptions,
  WorkerContext,
  WorkerFactory,
  WorkerSource,
  ExecutionPreference,
  WorkerHandler,
} from "./fetch/types.js";
export { FetchRuntime, type FetchRuntimeOptions } from "./fetch/runtime.js";

let installed = false;

/** Installs synchronously; await ready before local requests. Does not start a server. */
export function capacitorWorkers<Env = Record<string, unknown>>(
  options: CapacitorWorkersOptions<Env>,
) {
  if (installed)
    throw new Error("capacitorWorkers is already installed; dispose it first.");
  if (options.render !== undefined)
    validateRendering(options.render, options.baseURL);
  const original = globalThis.fetch;
  const runtime = createFetchRuntime(options);
  globalThis.fetch = runtime.fetch;
  installed = true;
  let disposed = false;
  let documents: ReturnType<typeof startRendering> | undefined;
  try {
    documents =
      options.render === undefined
        ? undefined
        : startRendering(
            runtime,
            options.render,
            options.baseURL,
            original.bind(globalThis),
          );
  } catch (error) {
    runtime.dispose();
    globalThis.fetch = original;
    installed = false;
    throw error;
  }
  const ready =
    documents?.ready.catch((error) => {
      if (!disposed) {
        runtime.dispose();
        if (globalThis.fetch === runtime.fetch) globalThis.fetch = original;
        installed = false;
        disposed = true;
      }
      throw error;
    }) ?? runtime.ready;
  let disposal: Promise<void> | undefined;
  return {
    ready,
    get execution() {
      return runtime.execution;
    },
    drain: () => runtime.drain(),
    dispose(): void | Promise<void> {
      if (disposed) return disposal;
      if (globalThis.fetch !== runtime.fetch)
        throw new Error(
          "fetch changed after installation; restore it before disposing.",
        );
      runtime.dispose();
      globalThis.fetch = original;
      disposed = true;
      if (documents) {
        disposal = documents.dispose().finally(() => {
          installed = false;
        });
        return disposal;
      }
      installed = false;
    },
  };
}
