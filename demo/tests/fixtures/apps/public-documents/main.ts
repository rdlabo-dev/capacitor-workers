import { capacitorWorkers } from "@rdlabo/capacitor-workers";
const app = capacitorWorkers({
  baseURL: "https://worker.invalid",
  render: "/pages/home",
});
await app.ready;
