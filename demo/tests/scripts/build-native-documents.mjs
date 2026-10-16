import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const demo = new URL("../../", import.meta.url);
execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/vite/bin/vite.js", demo)),
    "build",
    "--config",
    "tests/fixtures/apps/native-documents/vite.config.ts",
    ...process.argv.slice(2),
  ],
  { cwd: fileURLToPath(demo), stdio: "inherit" },
);
await build({
  entryPoints: [
    fileURLToPath(
      new URL("../native/documents/page-fetch.ts", import.meta.url),
    ),
  ],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: fileURLToPath(
    new URL("artifacts/native-documents/page-fetch.js", demo),
  ),
});
