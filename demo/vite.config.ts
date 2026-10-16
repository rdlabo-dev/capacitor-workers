import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
export default defineConfig({
  root: fileURLToPath(new URL("./src", import.meta.url)),
  plugins: [capacitorWorkersPlugin({ worker: "./workers/hono/standard.ts" })],
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
