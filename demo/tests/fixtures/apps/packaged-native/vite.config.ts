import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
import { resolve } from "node:path";
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "selected-worker": resolve(
        `workers/${mode === "express" ? "express.ts" : "hono.tsx"}`,
      ),
    },
  },
  plugins: [capacitorWorkersPlugin({ worker: "./worker.ts" })],
  build: { target: "es2022" },
}));
