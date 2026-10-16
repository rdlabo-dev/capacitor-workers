import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const demo = new URL("../../", import.meta.url);
const framework = process.argv[2] ?? "hono";
if (!["hono", "express"].includes(framework))
  throw Error("Expected hono|express");
execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/vite/bin/vite.js", demo)),
    "build",
    "--config",
    "tests/fixtures/apps/public-documents/vite.config.ts",
    "--mode",
    framework,
  ],
  { cwd: fileURLToPath(demo), stdio: "inherit" },
);
const probe = (
  await readFile(
    new URL("../native/documents/probe.js", import.meta.url),
    "utf8",
  )
).replace(
  "messageHandlers?.documentFetch?.postMessage({\n      report:",
  "messageHandlers?.publicDocumentProbe?.postMessage({\n      report:",
);
await writeFile(
  new URL("dist/probe.js", demo),
  probe.replace(
    'if (location.protocol === "https:" && navigator.serviceWorker)',
    "if (false)",
  ),
);
// Test instrumentation is a static asset, not a Worker route.
const manifest = new URL("dist/capacitor-workers-assets.json", demo);
await writeFile(
  manifest,
  JSON.stringify([
    ...JSON.parse(await readFile(manifest, "utf8")),
    "/probe.js",
  ]),
);
