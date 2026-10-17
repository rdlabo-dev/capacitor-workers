import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const [platform, device, manifest = "artifacts/native-package-consumer.json"] =
  process.argv.slice(2);
if (!["ios", "android"].includes(platform) || !device)
  throw Error(
    "Usage: run-native-network.mjs ios|android <device> [consumer manifest relative to demo]",
  );
const demo = fileURLToPath(new URL("../../", import.meta.url));
const { consumer } = JSON.parse(
  await readFile(resolve(demo, manifest), "utf8"),
);
const output = join(consumer, "artifacts/network");
const repo = resolve(demo, "..");
await mkdir(output, { recursive: true });
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
// The loopback fixture is a separate process so both platforms can share it.
assert.equal(
  (await fetch("http://127.0.0.1:4201/active")).status,
  200,
  "Start npm run test:native:network:server first",
);
run("npm", ["run", "build:native-network"], { cwd: demo });
await rm(join(consumer, "dist"), { recursive: true, force: true });
await cp(join(demo, "artifacts/native-network"), join(consumer, "dist"), {
  recursive: true,
});
run("npx", ["cap", "sync", platform]);
const fingerprints = {};
for (const file of ["main.js", "worker.js"])
  fingerprints[file] = createHash("sha256")
    .update(await readFile(join(consumer, "dist", file)))
    .digest("hex");
await writeFile(
  join(output, `${platform}-revision.json`),
  JSON.stringify(
    {
      revision: run("git", ["rev-parse", "HEAD"], { cwd: repo }).trim(),
      dirty: Boolean(
        run("git", ["status", "--porcelain"], { cwd: repo }).trim(),
      ),
      platform,
      device,
      fingerprints,
    },
    null,
    2,
  ),
);

const configFile =
  platform === "ios"
    ? "ios/App/App/capacitor.config.json"
    : "android/app/src/main/assets/capacitor.config.json";
const { appId } = JSON.parse(
  await readFile(join(consumer, configFile), "utf8"),
);
let child;
let log = "";
try {
  if (platform === "ios") {
    const build = run("xcodebuild", [
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
      "artifacts/ios",
      "-skipPackageUpdates",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ]);
    await writeFile(join(output, "ios-build.log"), build);
    run("xcrun", [
      "simctl",
      "install",
      device,
      join(
        consumer,
        "artifacts/ios/Build/Products/Debug-iphonesimulator/App.app",
      ),
    ]);
    child = spawn("xcrun", [
      "simctl",
      "launch",
      "--console-pty",
      "--terminate-running-process",
      device,
      appId,
    ]);
  } else {
    const build = run("./gradlew", ["--no-daemon", "assembleDebug"], {
      cwd: join(consumer, "android"),
    });
    await writeFile(join(output, "android-build.log"), build);
    run(adb, [
      ...adbArgs,
      "install",
      "-r",
      join(consumer, "android/app/build/outputs/apk/debug/app-debug.apk"),
    ]);
    run(adb, [...adbArgs, "shell", "am", "force-stop", appId]);
    child = spawn(adb, [...adbArgs, "logcat", "-T", "1", "-v", "raw"]);
  }
  child.stdout.on("data", (data) => {
    log += data;
  });
  child.stderr.on("data", (data) => {
    log += data;
  });
  if (platform === "android") {
    await new Promise((resolve) => setTimeout(resolve, 500));
    run(adb, [
      ...adbArgs,
      "shell",
      "am",
      "start",
      "-n",
      `${appId}/.MainActivity`,
    ]);
  }
  const deadline = Date.now() + 120_000;
  let results;
  while (!results && Date.now() < deadline) {
    const match = log.match(/NETWORK_COMPLETE (\d+)/);
    if (match) {
      results = [...log.matchAll(/NETWORK_RESULT (\{[^\r\n]+\})/g)].map(
        (entry) => JSON.parse(entry[1]),
      );
      assert.equal(
        results.length,
        Number(match[1]),
        "Incomplete native result log",
      );
    } else await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(results, "Native network report timed out");
  await writeFile(
    join(output, `${platform}.json`),
    JSON.stringify(results, null, 2),
  );
  assert.equal(
    results.length,
    80,
    "Unexpected native network contract coverage",
  );
  assert.deepEqual(
    results.filter((result) => !result.ok),
    [],
  );
  console.log(`${platform}: ${results.length} native network checks passed`);
} finally {
  child?.kill("SIGTERM");
  await writeFile(join(output, `${platform}.log`), log);
}
