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
  ],
  { cwd: temp, stdio: "pipe" },
);
await cp("demo", join(temp, "demo"), { recursive: true });
await writeFile(
  join(temp, "vite.config.mjs"),
  `import { capacitorWorkersPlugin } from '@rdlabo/capacitor-workers/vite';
export default {root:'demo',plugins:[capacitorWorkersPlugin()],build:{outDir:'../build',target:'es2022'}};`,
);
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  cwd: temp,
  stdio: "pipe",
});
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
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await writeFile(
    resolve(root, "artifacts/package-results.json"),
    JSON.stringify({ consumer: temp, results }, null, 2),
  );
  console.log(
    `Packed consumer: ${results.length}/${results.length} passed (${temp})`,
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
