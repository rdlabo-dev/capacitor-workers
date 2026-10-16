import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: fileURLToPath(
      new URL("../../artifacts/dedicated-worker", import.meta.url),
    ),
    emptyOutDir: true,
    target: "es2022",
  },
});
