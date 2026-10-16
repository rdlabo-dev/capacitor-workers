import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    capacitorWorkersPlugin({
      worker: "./workers/hono.tsx",
      // Replace with './workers/express.ts' to use Workers Express.
    }),
  ],
  build: {
    outDir: fileURLToPath(new URL("../dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
