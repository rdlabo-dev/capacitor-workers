import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/esbuild";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const framework of ["hono", "express"]) {
  await viteBuild({
    configFile: resolve(root, "build-tools/vite.config.ts"),
    mode: framework,
  });
  const outdir = resolve(root, `artifacts/build-tools/esbuild-${framework}`);
  await esbuild({
    absWorkingDir: root,
    entryPoints: { "nested/app": "build-tools/main.ts" },
    outdir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    splitting: true,
    assetNames: "assets/[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    plugins: [
      capacitorWorkersPlugin({ worker: `workers/${framework}/standard.ts` }),
    ],
  });
  await writeFile(
    resolve(outdir, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>esbuild contract</title></head><body><script type="module" src="./nested/app.js"></script></body></html>',
  );
}
const raw = resolve(root, "artifacts/build-tools/raw");
await mkdir(raw, { recursive: true });
await cp(resolve(root, "build-tools/raw"), raw, { recursive: true });
// Copy the ESM distribution verbatim: these files are never bundled.
const dist = dirname(
  fileURLToPath(import.meta.resolve("@rdlabo/capacitor-workers")),
);
await cp(dist, resolve(raw, "lib"), { recursive: true });
