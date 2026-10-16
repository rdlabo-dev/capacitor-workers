import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const [sample, platform, device] = process.argv.slice(2);
if (!sample || !["ios", "android"].includes(platform) || !device)
  throw Error(
    "Usage: run-upstream-native.mjs <upstream sample> ios|android <simulator UUID|emulator serial>",
  );
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const meta = JSON.parse(
  await readFile(
    join(repo, "demo/tests/upstream", sample, "upstream.json"),
    "utf8",
  ),
);
const { consumer } = JSON.parse(
  await readFile(
    join(repo, "demo/artifacts/upstream", `${sample}-consumer.json`),
    "utf8",
  ),
);
const { appId } = JSON.parse(
  await readFile(join(consumer, "capacitor.config.json"), "utf8"),
);
const output = join(consumer, "artifacts");
const evidence = join(repo, "demo/artifacts/upstream", sample);
await mkdir(output, { recursive: true });
await mkdir(evidence, { recursive: true });
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: consumer,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
const adb = process.env.ADB ?? "adb";
const adbArgs = [
  ...(process.env.ADB_SERVER_PORT ? ["-P", process.env.ADB_SERVER_PORT] : []),
  "-s",
  device,
];
const adbRun = (args) => run(adb, [...adbArgs, ...args]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runId = randomUUID();
await writeFile(
  join(consumer, "public/probe-run.json"),
  JSON.stringify({ runId }),
);
run("npm", ["run", "build"]);
run("npx", ["cap", "sync", platform]);
const buildLog = await open(
  join(output, `${platform}-${sample}-build.log`),
  "w",
);
try {
  if (platform === "ios")
    run(
      "xcodebuild",
      [
        "-project",
        "ios/App/App.xcodeproj",
        "-scheme",
        "App",
        "-configuration",
        "Debug",
        "-sdk",
        "iphonesimulator",
        "-destination",
        `id=${device}`,
        "-derivedDataPath",
        join(output, "ios"),
        "-skipPackageUpdates",
        "CODE_SIGNING_ALLOWED=NO",
        "build",
      ],
      { stdio: ["ignore", buildLog.fd, buildLog.fd] },
    );
  else
    run("./gradlew", [":app:assembleDebug"], {
      cwd: join(consumer, "android"),
      stdio: ["ignore", buildLog.fd, buildLog.fd],
    });
} finally {
  await buildLog.close();
}
if (platform === "ios")
  run("xcrun", [
    "simctl",
    "install",
    device,
    join(output, "ios/Build/Products/Debug-iphonesimulator/App.app"),
  ]);
else
  adbRun([
    "install",
    "-r",
    join(consumer, "android/app/build/outputs/apk/debug/app-debug.apk"),
  ]);

let log = "";
let child;
const receive = (chunk) => {
  log += chunk.toString();
};
if (platform === "ios") {
  child = spawn(
    "xcrun",
    [
      "simctl",
      "launch",
      "--console-pty",
      "--terminate-running-process",
      device,
      appId,
    ],
    { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] },
  );
} else {
  adbRun(["shell", "am", "force-stop", appId]);
  adbRun(["shell", "am", "start", "-n", appId + "/.MainActivity"]);
  let pid;
  for (let i = 0; i < 30 && !pid; i++) {
    try {
      pid = adbRun(["shell", "pidof", appId]).trim();
    } catch {}
    if (!pid) await sleep(100);
  }
  assert.ok(pid, "Android app did not launch");
  child = spawn(
    adb,
    [...adbArgs, "logcat", "--pid=" + pid, "-T", "1", "-v", "raw"],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}
child.stdout.on("data", receive);
child.stderr.on("data", receive);
let cursor = 0;
const waitMarker = (name, regex, timeout = 180000) =>
  new Promise((resolve, reject) => {
    const finish = (action, value) => {
      clearInterval(poll);
      clearTimeout(timer);
      action(value);
    };
    const timer = setTimeout(
      () => finish(reject, new Error(`Timed out waiting for ${name}`)),
      timeout,
    );
    const poll = setInterval(() => {
      const match = log.slice(cursor).match(regex);
      if (!match) return;
      cursor += match.index + match[0].length;
      finish(resolve, match);
    }, 100);
  });
const screenshot = async (file) => {
  if (platform === "ios")
    run("xcrun", ["simctl", "io", device, "screenshot", file]);
  else {
    const png = execFileSync(adb, [...adbArgs, "exec-out", "screencap", "-p"]);
    await writeFile(file, png);
  }
};
try {
  const execution = (
    await waitMarker("UPSTREAM_READY", /UPSTREAM_READY (\w+)/, 120000)
  )[1];
  const report = JSON.parse(
    (await waitMarker("UPSTREAM_RESULT", /UPSTREAM_RESULT (\{[^\r\n]+\})/))[1],
  );
  assert.equal(report.runId, runId, "Report must belong to the current run");
  // Require the exact declared case set, not merely "no failures": an early
  // or partial report must not read as success.
  assert.deepEqual(
    report.cases.map((c) => c.name).sort(),
    [...meta.probeCases].sort(),
    "Reported cases do not match the declared probe case set",
  );
  const failed = report.cases.filter((c) => !c.passed);
  const resultFile = `${platform}-${sample}`;
  await screenshot(join(output, `${resultFile}-report.png`));
  // The probe navigates to the upstream 404 page shortly after reporting;
  // capture the rendered text/plain body for evidence.
  await sleep(4000);
  await screenshot(join(output, `${resultFile}-404.png`));
  await writeFile(
    join(output, `${resultFile}.json`),
    JSON.stringify(
      { sample, platform, device, appId, execution, ...report },
      null,
      2,
    ),
  );
  for (const file of [
    `${resultFile}.json`,
    `${resultFile}-report.png`,
    `${resultFile}-404.png`,
  ])
    await cp(join(output, file), join(evidence, file));
  assert.deepEqual(failed, [], `Failed cases: ${JSON.stringify(failed)}`);
  console.log(
    `${platform}/${sample}: ${report.cases.length}/${report.cases.length} upstream checks passed (execution: ${execution})`,
  );
} finally {
  child?.kill("SIGTERM");
  await writeFile(join(output, `${platform}-${sample}-console.log`), log);
  try {
    await cp(
      join(output, `${platform}-${sample}-console.log`),
      join(evidence, `${platform}-${sample}-console.log`),
    );
  } catch {}
}
