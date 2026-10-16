import { cp, mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "capacitor-workers-consumer-"));
const pack = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", temp], {
    encoding: "utf8",
  }),
)[0];
await writeFile(
  join(temp, "package.json"),
  JSON.stringify({ name: "fresh-consumer", private: true, type: "module" }),
);
execFileSync(
  "npm",
  [
    "install",
    join(temp, pack.filename),
    "vite@7.3.7",
    "hono@4.13.13",
    "express@5.3.0",
    "@capacitor/core@8.5.3",
    "typescript@7.0.2",
  ],
  { cwd: temp, stdio: "pipe" },
);
// The consumer test needs web sources only, not native projects/build outputs.
for (const entry of [
  "workers",
  "public",
  "main.ts",
  "index.html",
  "contract.ts",
  "cloudflare.d.ts",
  "client.d.ts",
  "experiments/dedicated-worker",
]) {
  await cp(join("demo", entry), join(temp, "demo", entry), { recursive: true });
}
await writeFile(
  join(temp, "vite.config.mjs"),
  `import { capacitorWorkersPlugin } from '@rdlabo/capacitor-workers/vite';
export default {root:'demo',plugins:[capacitorWorkersPlugin()],build:{outDir:'../build',target:'es2022'}};`,
);
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  cwd: temp,
  stdio: "pipe",
});
await writeFile(
  join(temp, "consumer.ts"),
  `/// <reference types="@rdlabo/capacitor-workers/client" />
import worker from "./demo/workers/hono/standard?capacitor-worker";
import { capacitorWorkers, FetchRuntime, type WorkerContext } from "@rdlabo/capacitor-workers";
class ExampleRuntime extends FetchRuntime<{ label: string }> {
  protected dispatch(request: Request, env: { label: string }, ctx: WorkerContext) {
    ctx.waitUntil(Promise.resolve());
    return new Response(env.label + request.method);
  }
}
const example = new ExampleRuntime({ baseURL: "https://worker.invalid/api", env: { label: "local" } });
const fetcher: typeof fetch = example.fetch;
example.dispose();
const runtime = capacitorWorkers({worker, baseURL:"https://worker.invalid/api"});
const ready: Promise<void> = runtime.ready;
// @ts-expect-error Worker factories must not degrade to any.
const invalid: number = worker;
runtime.dispose();
`,
);
execFileSync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    "--noEmit",
    "--skipLibCheck",
    "--moduleResolution",
    "bundler",
    "--module",
    "esnext",
    "--target",
    "es2022",
    "consumer.ts",
  ],
  { cwd: temp, stdio: "pipe" },
);
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4189",
    "--strictPort",
  ],
  { cwd: temp, stdio: "pipe" },
);
let browser;
try {
  const deadline = Date.now() + 20000;
  while (true) {
    try {
      if ((await fetch("http://127.0.0.1:4189")).ok) break;
    } catch {}
    if (child.exitCode !== null || Date.now() > deadline)
      throw new Error("Consumer preview failed to start");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4189");
  await page.waitForFunction(() => window.pocDone);
  const results = await page.evaluate(() => window.pocResults);
  if (results?.length !== 26 || results.some((r) => !r.ok))
    throw new Error(await page.locator("pre").innerText());
  // Rebuild the same installed tarball consumer using the public isolated import.
  await writeFile(
    join(temp, "vite.config.mjs"),
    `import { capacitorWorkersPlugin } from '@rdlabo/capacitor-workers/vite';
export default {root:'demo/experiments/dedicated-worker',plugins:[capacitorWorkersPlugin()],build:{outDir:'../../../build',emptyOutDir:true,target:'es2022'}};`,
  );
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
    cwd: temp,
    stdio: "pipe",
  });
  await page.goto("http://127.0.0.1:4189");
  await page.waitForFunction(
    () => typeof window.startExperiment === "function",
  );
  const isolated = [];
  for (const framework of ["hono", "express"]) {
    await page.evaluate(async (framework) => {
      window.experiment = window.startExperiment(
        location.origin,
        "https://worker.invalid/api",
        framework,
      );
      await window.experiment.ready;
    }, framework);
    await page.context().setOffline(true);
    try {
      const checks = await page.evaluate(async (framework) => {
        const results = await window.runFrameworkContract(framework);
        await window.experiment.drain();
        if (window.experiment.errors.length)
          throw new Error("Background errors");
        return results;
      }, framework);
      if (checks.length !== 11 || checks.some((r) => !r.ok))
        throw new Error(JSON.stringify(checks));
      isolated.push(...checks);
    } finally {
      await page.evaluate(() => window.experiment.dispose());
      await page.context().setOffline(false);
    }
  }
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await writeFile(
    resolve(root, "artifacts/package-results.json"),
    JSON.stringify({ consumer: temp, direct: results, isolated }, null, 2),
  );
  console.log(
    `Packed consumer: direct ${results.length}/26, isolated ${isolated.length}/22 passed (${temp})`,
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
