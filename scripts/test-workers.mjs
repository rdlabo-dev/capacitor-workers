import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { runContract } from "../demo/contract.ts";

const reports = {};
for (const [framework, port] of [
  ["hono", 8797],
  ["express", 8798],
]) {
  const child = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--local",
      "--config",
      `wrangler.${framework}.json`,
      "--port",
      String(port),
      "--inspector-port",
      String(port + 1000),
    ],
    {
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  try {
    const base = `http://127.0.0.1:${port}/api`;
    const deadline = Date.now() + 60000;
    while (true) {
      try {
        if ((await fetch(`${base}/hello`)).ok) break;
      } catch {}
      if (Date.now() > deadline || child.exitCode !== null)
        throw new Error(output);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    reports[framework] = await runContract(fetch, base);
    console.log(framework, JSON.stringify(reports[framework]));
    if (reports[framework].some((result) => !result.ok)) process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
}
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/workerd-results.json",
  JSON.stringify(reports, null, 2),
);
