import { kvRequest } from "../../src/features/kv";
import { runFeatures } from "../../src/features/run";
import { Capacitor } from "@capacitor/core";
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import isolation from "../../src/workers/runtime/isolation?capacitor-worker";
import hono from "../../src/workers/hono/standard?capacitor-worker";
import express from "../../src/workers/express/standard?capacitor-worker";
import { runFrameworkContract } from "./frameworks";

export type Framework = "hono" | "express";
export function startExperiment(
  upstream: string,
  baseURL = `${upstream}/api`,
  framework?: Framework,
) {
  const errors: string[] = [];
  const runtime = capacitorWorkers({
    worker:
      framework === "hono"
        ? hono
        : framework === "express"
          ? express
          : isolation,
    baseURL,
    env: { UPSTREAM: upstream },
    onBackgroundError: (error) => errors.push(String(error)),
  });
  return {
    errors,
    ready: runtime.ready,
    drain: runtime.drain,
    dispose: runtime.dispose,
  };
}
declare global {
  interface Window {
    runFeatures: typeof runFeatures;
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

window.runFeatures = runFeatures;

Object.assign(window, { kvRequest });

export function startPreferred(
  prefer?: "worker" | "direct",
  env: Record<string, unknown> = {},
) {
  return capacitorWorkers({
    baseURL: "https://preferred.example/api",
    prefer,
    env,
  });
}
declare global {
  interface Window {
    startPreferred: typeof startPreferred;
  }
}
window.startPreferred = startPreferred;

export function startStartupProbe() {
  return capacitorWorkers({
    baseURL: "https://preferred.example/api",
    prefer: "direct",
    worker: {
      createWorker: () => {
        throw new Error("Direct-only regression fixture");
      },
      loadDirect: async () =>
        (await import("../../src/workers/runtime/direct-startup-fetch"))
          .default,
    },
  });
}
export function startDelayedDirect() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runtime = capacitorWorkers({
    baseURL: "https://preferred.example/api",
    prefer: "direct",
    worker: {
      createWorker: () => {
        throw new Error("Direct-only regression fixture");
      },
      loadDirect: async () => {
        await gate;
        return (await import("../../src/workers/runtime/isolation")).default;
      },
    },
  });
  return { runtime, release };
}
declare global {
  interface Window {
    startStartupProbe: typeof startStartupProbe;
    startDelayedDirect: typeof startDelayedDirect;
  }
}
window.startStartupProbe = startStartupProbe;
window.startDelayedDirect = startDelayedDirect;
