import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { startApp } from "./app";

// The Worker entry is configured in vite.config.ts.
const runtime = capacitorWorkers({
  baseURL: "https://worker.invalid/api/",
});
await runtime.ready;
await startApp();
