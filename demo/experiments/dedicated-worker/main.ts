import { Capacitor } from "@capacitor/core";
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { createIsolatedWorker } from "./bridge";
import { runFrameworkContract } from "./frameworks";

export type Framework = "hono" | "express";
export function startExperiment(
  upstream: string,
  baseURL = `${upstream}/api`,
  framework?: Framework,
) {
  // Static entrypoints let Vite build separate bundles; Hono never imports Express.
  const worker =
    framework === "hono"
      ? new Worker(new URL("./hono.ts", import.meta.url), { type: "module" })
      : framework === "express"
        ? new Worker(new URL("./express.ts", import.meta.url), {
            type: "module",
          })
        : new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
          });
  const isolated = createIsolatedWorker(worker);
  const errors: string[] = [];
  const runtime = capacitorWorkers({
    worker: isolated.handler,
    baseURL,
    env: { UPSTREAM: upstream },
    onBackgroundError: (error) => errors.push(String(error)),
  });
  return {
    errors,
    ready: isolated.ready,
    get activeCalls() {
      return isolated.activeCalls;
    },
    drain: runtime.drain,
    dispose() {
      runtime.dispose();
      isolated.dispose();
    },
  };
}
declare global {
  interface Window {
    startExperiment: typeof startExperiment;
    experiment: ReturnType<typeof startExperiment>;
    runFrameworkContract: typeof runFrameworkContract;
  }
}
window.startExperiment = startExperiment;
window.runFrameworkContract = runFrameworkContract;

if (Capacitor.isNativePlatform()) {
  void import("./native").then(({ runNativeExperiment }) =>
    runNativeExperiment(),
  );
}
