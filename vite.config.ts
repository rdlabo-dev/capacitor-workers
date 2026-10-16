import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "./dist/vite.js";
export default defineConfig({
  root: "demo",
  plugins: [capacitorWorkersPlugin()],
  build: { outDir: "../demo-dist", emptyOutDir: true, target: "es2022" },
});
