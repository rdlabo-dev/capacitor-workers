import { capacitorWorkers } from "@rdlabo/capacitor-workers";

// The Worker entry is configured in vite.config.ts.
const runtime = capacitorWorkers({
  baseURL: "https://worker.invalid/api/",
});
await runtime.ready;
