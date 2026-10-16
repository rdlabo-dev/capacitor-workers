import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [capacitorWorkersPlugin()],
  worker: { plugins: () => capacitorWorkersPlugin() },
  build: {
    outDir: fileURLToPath(
      new URL("../../artifacts/dedicated-worker", import.meta.url),
    ),
    emptyOutDir: true,
    target: "es2022",
  },
});
