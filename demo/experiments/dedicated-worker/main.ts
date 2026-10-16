import { kvRequest } from "../../features/kv";
import { runFeatures } from "../../features/run";
import { Capacitor } from "@capacitor/core";
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import isolation from "../../workers/runtime/isolation?capacitor-worker";
import hono from "../../workers/hono/standard?capacitor-worker";
import express from "../../workers/express/standard?capacitor-worker";
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
