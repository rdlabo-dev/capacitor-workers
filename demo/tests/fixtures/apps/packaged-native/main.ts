import { capacitorWorkers } from "@rdlabo/capacitor-workers";
localStorage.removeItem("packaged-stop");
const app = capacitorWorkers({
  baseURL: "https://worker.invalid",
  render: "/pages/home",
});
await app.ready;
// iOS keeps this window alive as the runtime host. Exercise public disposal here.
if ((window as any).Capacitor?.getPlatform() === "ios") {
  const timer = setInterval(async () => {
    if (localStorage.getItem("packaged-stop") !== "requested") return;
    clearInterval(timer);
    localStorage.removeItem("packaged-stop");
    await app.dispose();
    console.log("PACKAGED_STOP", "ios public dispose completed");
  }, 100);
}
