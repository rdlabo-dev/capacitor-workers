import { capacitorWorkers } from "@rdlabo/capacitor-workers";

const app = capacitorWorkers({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
console.log("UPSTREAM_READY", app.execution);
