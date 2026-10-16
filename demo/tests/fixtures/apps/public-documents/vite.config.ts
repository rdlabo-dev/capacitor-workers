import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig(({ mode }) => ({
  root: here("."),
  publicDir: here("../native-documents/public"),
  plugins: [
    capacitorWorkersPlugin({
      worker: here(
        `../../workers/rendering/${mode === "express" ? "express.ts" : "hono.tsx"}`,
      ),
    }),
  ],
  build: {
    outDir: here("../../../../dist"),
    emptyOutDir: true,
    target: "es2022",
  },
}));
