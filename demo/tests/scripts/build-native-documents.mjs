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

// Deliberately absent from the manifest: shutdown must restore native asset handling.
const { writeFile } = await import("node:fs/promises");
await writeFile(
  new URL("artifacts/native-documents/after-dispose.html", demo),
  "<!doctype html><h1>Native asset after disposal</h1>",
);
await writeFile(
  new URL("artifacts/native-documents/application-sw.js", demo),
  "self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));",
);
