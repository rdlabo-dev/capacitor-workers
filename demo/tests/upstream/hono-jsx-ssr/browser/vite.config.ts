import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
import { workerEntry } from "../sample";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [capacitorWorkersPlugin({ worker: workerEntry })],
  build: {
    outDir: fileURLToPath(
      new URL(
        "../../../../artifacts/upstream/hono-jsx-ssr/browser/",
        import.meta.url,
      ),
    ),
    emptyOutDir: true,
    target: "es2022",
  },
});
