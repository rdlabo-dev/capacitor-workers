import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
export default defineConfig({
  plugins: [capacitorWorkersPlugin()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
