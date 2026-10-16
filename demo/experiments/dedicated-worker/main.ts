import { Capacitor } from "@capacitor/core";
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { createIsolatedWorker } from "./bridge";

export function startExperiment(upstream: string, baseURL = `${upstream}/api`) {
  const isolated = createIsolatedWorker();
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
  }
}
window.startExperiment = startExperiment;

if (Capacitor.isNativePlatform()) {
  void import("./native").then(({ runNativeExperiment }) =>
    runNativeExperiment(),
  );
}
