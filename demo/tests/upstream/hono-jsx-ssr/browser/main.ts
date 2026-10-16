import { capacitorWorkers } from "@rdlabo/capacitor-workers";

const prefer =
  new URL(location.href).searchParams.get("prefer") === "direct"
    ? "direct"
    : "worker";
const runtime = capacitorWorkers({ baseURL: "https://worker.invalid", prefer });
declare global {
  interface Window {
    upstreamReady: Promise<typeof runtime.execution>;
  }
}
window.upstreamReady = runtime.ready.then(() => runtime.execution);
