import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { createIsolatedWorker } from "./bridge";

export function startExperiment(upstream: string) {
  const isolated = createIsolatedWorker();
  const errors: string[] = [];
  const runtime = capacitorWorkers({
    worker: isolated.handler,
    baseURL: `${upstream}/api`,
    env: { UPSTREAM: upstream },
    onBackgroundError: (error) => errors.push(String(error)),
  });
  return {
    errors,
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
