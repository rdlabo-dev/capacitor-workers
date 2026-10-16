import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
export default defineConfig({
  plugins: [capacitorWorkersPlugin({ worker: "./workers/hono/standard.ts" })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        demo: fileURLToPath(new URL("./index.html", import.meta.url)),
        validation: fileURLToPath(
          new URL("./validation/index.html", import.meta.url),
        ),
      },
    },
  },
});
