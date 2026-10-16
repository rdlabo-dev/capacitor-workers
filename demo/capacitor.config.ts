import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "jp.rdlabo.capacitorworkers.poc",
  appName: "Workers PoC",
  webDir:
    process.env.CAPACITOR_WORKERS_EXPERIMENT === "1"
      ? "artifacts/dedicated-worker"
      : process.env.CAPACITOR_WORKERS_VALIDATION === "1"
        ? "artifacts/validation"
        : "dist",
};
export default config;
