import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: fileURLToPath(new URL("../artifacts/build-tools", import.meta.url)),
  },
});
