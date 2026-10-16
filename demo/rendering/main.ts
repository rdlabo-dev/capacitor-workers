import { capacitorWorkers } from "@rdlabo/capacitor-workers";
// The configured Worker supplies the complete HTML document and owns routing.
const app = capacitorWorkers({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
